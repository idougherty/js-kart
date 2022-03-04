const util = require('./server/modules/util');
const ClientHandler = require('./server/modules/clientHandler');
const Camera = require('./server/modules/camera');
const avsc = require('./server/modules/serialize.js');

const HOST = "wss://js-kart.herokuapp.com/";
// const HOST = "ws://localhost:8181";

let socket = new WebSocket(HOST);

let game = new ClientHandler(); 

let canvas = document.getElementById("paper");
let camera = new Camera(canvas);

// TODO: create circular queue for messages
let messageTypes = {};
let messages = [];

socket.onerror = error => {
    camera.drawError(error);
}

socket.onopen = event => {
    console.log("Client connected!");

    game.tick = Math.floor(game.getTick());
    waitForID();
}

socket.onmessage = async event => {
    const buffer = await event.data.arrayBuffer();
    let data = avsc.decode(buffer);

    if(data.packets.ping) {
        game.latency = data.packets.ping.latency;
        console.log(game.latency);
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
    let rewind = game.tick;
    let auth_state = null;
    
    while(messages.length > 0 && messages[0].tick < tick) {
        const message = popMessage(0);

        if(message.packets.id != null)
            game.processPacket(message.packets.id, 'id');
        
        if(message.packets.static)
            game.processPacket(message.packets.static, 'static');

        if(message.packets.dynamic) {
            game.processPacket(message.packets.dynamic, 'dynamic');

            const buffered = util.getBuffer(game.stateBuffer, message.tick);
            if(buffered) {
                if(game.comparePlayerStates(buffered.cars[game.id], message.packets.dynamic.cars[game.id])) {
                    rewind = game.tick;
                    auth_state = null;
                } else {
                    rewind = message.tick;
                    auth_state = message.packets.dynamic.cars[game.id];
                }
            } else {
                auth_state = message.packets.dynamic.cars[game.id];
            }
        }
    }

    if(auth_state) {
        game.processPacket(auth_state, 'rewind');
    }

    return rewind;
}

function handleInputs() {
    let buffered = util.getBuffer(game.stateBuffer, game.tick - 1)
    
    if(buffered)
        buffered = buffered.cars[game.id].inputs;

    for(const key in game.inputs) {
        if(!buffered || game.inputs[key] != buffered[key]) {
            sendInputs(game.inputs);

            if(game.isSpectator)
                game.changeViewID();

            break;
        }
    }
}

function sendInputs(inputs) {
    let bundle = {
        packets: {
            inputs: inputs, 
        },
        tick: game.tick,
    }

    const message = avsc.encode(bundle);
    socket.send(message);
}

function waitForID() {  
    game.tick = Math.floor(game.getTick());

    processTick(game.tick);

    if(game.id != null) {
        gameLoop();
        return;
    }

    window.requestAnimationFrame(waitForID);
}

// TODO handle weird collision rubberbanding
// probably comes from having outdated versions of other players
// in the state buffer

function gameLoop() {
    const dt = .016;
    const curTick = Math.floor(game.getTick());
    const alpha = game.getTick() - curTick;
    
    if(curTick - game.tick > 128)
        game.tick = curTick - 128;

    game.updateViewID();

    while(game.tick < curTick) {
        
        handleInputs();
        
        if(!game.isSpectator)
            game.state.cars[game.id].inputs = game.inputs;
        
        util.setBuffer(game.stateBuffer, game.tick, game.copyDynamicState(game.state));
        
        game.update(dt);
        
        if(game.state.scene == "race") {
            camera.update(game.state.cars[game.viewID], dt);
        }

        game.tick++;
    }

    let rewind = processTick(game.tick);
    // console.log(game.tick - rewind);

    while(rewind < game.tick) {
        for(const [idx, cars] of Object.entries(game.state.cars)) {
            cars.inputs = util.getBuffer(game.stateBuffer, rewind).cars[idx].inputs;
        }
        
        util.setBuffer(game.stateBuffer, rewind, game.copyDynamicState(game.state));

        game.update(dt);

        rewind++;
    }

    let lerp = game.lerpState(alpha);
    
    // won't draw unless this code is here??
    if(game.state.scene == "race") {
        camera.update(game.state.cars[game.viewID], 0.001);
    }

    camera.draw(lerp, game.viewID, game.isSpectator, game.freezeTime);

    window.requestAnimationFrame(gameLoop);
}

document.addEventListener("keydown", (e) => {
    switch(e.code) {
        case 'KeyW':
        case 'ArrowUp':
            game.inputs.up = true;
            break;
        case 'KeyA':
        case 'ArrowLeft':
            game.inputs.left = true;
            break;
        case 'KeyS':
        case 'ArrowDown':
            game.inputs.down = true;
            break;
        case 'KeyD':
        case 'ArrowRight':
            game.inputs.right = true;
            break;
        case 'ShiftLeft':
            game.inputs.shift = true;
            break;
        case "Enter":
            game.inputs.enter = true;
            break;
        default:
    }
});

document.addEventListener("keyup", (e) => {
    switch(e.code) {
        case 'KeyW':
        case 'ArrowUp':
            game.inputs.up = false;
            break;
        case 'KeyA':
        case 'ArrowLeft':
            game.inputs.left = false;
            break;
        case 'KeyS':
        case 'ArrowDown':
            game.inputs.down = false;
            break;
        case 'KeyD':
        case 'ArrowRight':
            game.inputs.right = false;
            break;
        case 'ShiftLeft':
            game.inputs.shift = false;
            break;
        case 'Enter':
            game.inputs.enter = false;
            break;
        default:
    }
});