const util = require('../shared_modules/util');
const Client = require('./client');
const Camera = require('../shared_modules/camera');
const avsc = require('../shared_modules/serialize.js');
require('dotenv').config();

const HOST = process.env.HOST_URI;

let socket = new WebSocket(HOST);

let client = new Client(); 

let canvas = document.getElementById("paper");
let camera = new Camera(canvas);

// TODO: create circular queue for messages
let messageTypes = {};
let messages = [];

document.fonts.ready.then(() => {
    camera.drawLoading();
});

socket.onerror = error => {
    camera.drawError(error);
}

socket.onopen = event => {
    console.log("Client connected!");

    client.tick = Math.floor(client.getTick());
    waitForID();
}

socket.onmessage = async event => {
    const buffer = await event.data.arrayBuffer();
    let data = avsc.decode(buffer);

    if(data.packets.ping) {
        client.latency = data.packets.ping.latency + client.delay;
        socket.send(avsc.encode(data));
        return;
    }

    pushMessage(data);

    if(messages.length > 128) {
        for(const [idx, message] of messages.entries()) {
            
            necessary = false;

            for(const id of Object.keys(message.packets)) {
                if(messageTypes[id] <= 1) {
                    necessary = true;
                    break;
                }
            }

            if(!necessary) {
                popMessage(idx);
                return;
            }
        }
    }
}

function pushMessage(message) {
    messages.push(message);

    for(const id of Object.keys(message.packets)) {
        if(messageTypes[id]) {
            messageTypes[id]++;
        } else {
            messageTypes[id] = 1;
        }
    }
}

function popMessage(idx) {
    for(const id of Object.keys(messages[idx].packets)) {
        messageTypes[id]--;
    }
                    
    return messages.splice(idx, 1)[0];
}

function processTick(tick) {
    let rewind = client.tick;
    let auth_state = null;
    
    while(messages.length > 0 && messages[0].tick < tick) {
        const message = popMessage(0);

        if(message.packets.id != null)
            client.processPacket(message.packets.id, 'id');
        
        if(message.packets.static)
            client.processPacket(message.packets.static, 'static');

        if(message.packets.dynamic) {
            client.processPacket(message.packets.dynamic, 'dynamic');

            const buffered = util.getBuffer(client.stateBuffer, message.tick);
            if(buffered && !client.isSpectator) {
                if(client.comparePlayerStates(buffered.cars[client.id], message.packets.dynamic.cars[client.id])) {
                    rewind = client.tick;
                    auth_state = null;
                } else {
                    rewind = message.tick;
                    auth_state = message.packets.dynamic.cars[client.id];
                }
            } else {
                auth_state = message.packets.dynamic.cars[client.id];
            }
        }
    }

    if(auth_state) {
        client.processPacket(auth_state, 'rewind');
    }

    return rewind;
}

function handleInputs() {
    let bufferFrame = util.getBuffer(client.stateBuffer, client.tick - 1);
    let hasBuffer = !client.isSpectator && bufferFrame;
    let bufferedInputs = null;
    
    if(hasBuffer)
        bufferedInputs = bufferFrame.cars[client.id].inputs;

    for(const key in client.inputs) {
        if(!hasBuffer || client.inputs[key] != bufferedInputs[key]) {
            sendInputs(client.inputs);

            if(client.isSpectator)
                client.changeViewID();

            break;
        }
    }
}

function sendInputs(inputs) {
    let bundle = {
        packets: {
            inputs: inputs, 
        },
        tick: client.tick,
    }

    const message = avsc.encode(bundle);
    socket.send(message);
}

function waitForID() {  
    client.tick = Math.floor(client.getTick());

    processTick(client.tick);

    if(client.id != null) {
        gameLoop();
        return;
    }

    window.requestAnimationFrame(waitForID);
}

function gameLoop() {
    const dt = .016;
    const curTick = Math.floor(client.getTick());
    const alpha = client.getTick() - curTick;
    
    if(curTick - client.tick > 128)
        client.tick = curTick - 128;

    client.updateViewID();

    while(client.tick < curTick) {
        handleInputs();
        
        if(!client.isSpectator)
            client.state.cars[client.id].inputs = client.inputs;
        
        util.setBuffer(client.stateBuffer, client.tick, client.copyDynamicState(client.state));
        
        client.update(dt);

        client.tick++;
    }

    let rewind = processTick(client.tick);

    if(rewind != client.tick)
        console.log(client.tick - rewind);

    while(rewind < client.tick) {
        for(const [idx, cars] of Object.entries(client.state.cars)) {
            let bufferedCar = util.getBuffer(client.stateBuffer, rewind).cars[idx];
            
            if(bufferedCar)
                cars.inputs = bufferedCar.inputs;
        }
        
        util.setBuffer(client.stateBuffer, rewind, client.copyDynamicState(client.state));

        client.update(dt);

        rewind++;
    }

    let lerp = client.lerpState(alpha);
    
    if(client.state.scene == "race")
        camera.update(lerp.cars[client.viewID], dt);

    camera.draw(lerp, client);
    camera.drawPing(Math.floor(client.latency * 100)/100);

    window.requestAnimationFrame(gameLoop);
}

document.addEventListener("keydown", (e) => {
    switch(e.code) {
        case 'KeyW':
        case 'ArrowUp':
            client.inputs.up = true;
            break;
        case 'KeyA':
        case 'ArrowLeft':
            client.inputs.left = true;
            break;
        case 'KeyS':
        case 'ArrowDown':
            client.inputs.down = true;
            break;
        case 'KeyD':
        case 'ArrowRight':
            client.inputs.right = true;
            break;
        case 'ShiftLeft':
            client.inputs.shift = true;
            break;
        case "Enter":
            client.inputs.enter = true;
            break;
        default:
    }
});

document.addEventListener("keyup", (e) => {
    switch(e.code) {
        case 'KeyW':
        case 'ArrowUp':
            client.inputs.up = false;
            break;
        case 'KeyA':
        case 'ArrowLeft':
            client.inputs.left = false;
            break;
        case 'KeyS':
        case 'ArrowDown':
            client.inputs.down = false;
            break;
        case 'KeyD':
        case 'ArrowRight':
            client.inputs.right = false;
            break;
        case 'ShiftLeft':
            client.inputs.shift = false;
            break;
        case 'Enter':
            client.inputs.enter = false;
            break;
        default:
    }
});