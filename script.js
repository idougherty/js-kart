const util = require('./server/modules/util');
const ClientHandler = require('./server/modules/clientHandler');
const Camera = require('./server/modules/camera');
const avsc = require('./server/modules/serialize.js');

// var HOST = location.origin.replace(/^http/, 'ws')

// HOST = "ws://js-kart.herokuapp.com/";
const HOST = "ws://localhost:8181"; 
const socket = new WebSocket(HOST);
let game = new ClientHandler(); 

let canvas = document.getElementById("paper");
let camera = new Camera(canvas);

// TODO: create circular queue for messages
let messageTypes = {};
let messages = [];

socket.onopen = event => {
    console.log("Client connected!");

    game.tick = Math.floor(game.getTick());
    waitForID();
}

socket.onmessage = async event => {
    const buffer = await event.data.arrayBuffer();
    let data = avsc.decode(buffer);
    
    // TODO integrate pings with normal message frames
    // if(data.ping) {
    //     game.latency = data.latency;
    //     socket.send(avsc.encode(data));
    //     return;
    // }

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

        if(message.packets.dynamic) {
            const buffered = util.getBuffer(game.stateBuffer, message.tick);
            if(buffered) {
                if(game.compareDynamicStates(buffered, message.packets.dynamic)) {
                    rewind = game.tick;
                    auth_state = null;
                } else {
                    rewind = message.tick;
                    auth_state = message.packets.dynamic;
                }
            } else {
                auth_state = message.packets.dynamic;
            }
        }

        if(message.packets.id != null)
            game.processPacket(message.packets.id, 'id');
        
        if(message.packets.static)
            game.processPacket(message.packets.static, 'static');
    }

    if(auth_state)
        game.processPacket(auth_state, 'dynamic');

    return rewind;
}

function handleInputs() {
    const buffered = util.getBuffer(game.inputBuffer, game.tick - 1);
        
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

    // if(Math.random() < .01) {
    //     console.log(messages)
    // }

    processTick(game.tick);

    if(game.id != null) {
        gameLoop();
        return;
    }

    window.requestAnimationFrame(waitForID);
}

// let delay = 0;
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
        util.setBuffer(game.inputBuffer, game.tick, util.copyObj(game.inputs));

        game.update(dt);
        
        if(game.state.scene == "race") {
            camera.update(game.state.cars[game.viewID], dt);
        }

        game.tick++;
    }

    let rewind = processTick(game.tick);

    // if(rewind < game.tick)
    //     console.log("Rewind!");

    while(rewind < game.tick) {
        if(!game.isSpectator)
            game.state.cars[game.id].inputs = util.getBuffer(game.inputBuffer, rewind);
        
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