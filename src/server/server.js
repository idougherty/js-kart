const avsc = require('../shared_modules/serialize')
const util = require('../shared_modules/util');
const Game = require('./game');
const WebSocket = require("ws");

let game = new Game();

const PORT = process.env.PORT || 8181;
wss = new WebSocket.Server({ port: PORT });
console.log("Server started on port: " + PORT);

wss.on("connection", socket => {
    processConnection(socket);

    socket.on("message", processMessage);
    socket.on("close", processClose);
});

function processConnection(socket) {
    const num_spectators = wss.clients.size - game.numPlayers - 1;
    const isSpectator = game.scene == "race" || num_spectators > 0;
    let id;

    if(isSpectator) {
        id = util.min_missing_id(wss.clients, util.MAX_PLAYERS, game.numPlayers); 
    } else {
        id = util.min_missing_id(wss.clients); 
    }

    addPlayer(socket, id);

    console.log(`New client connected: ID - ${id}`);
}

function updateLatency(socket, timestamp) {
    const BUFFER_SIZE = 10;
    let latency = (util.getTime() - timestamp) / 2;

    socket.pingBuffer.push(latency);

    if(socket.pingBuffer.length > BUFFER_SIZE)
        socket.pingBuffer.splice(0, 1);

    socket.latency = 0;
    
    socket.pingBuffer.forEach(val => socket.latency += val / socket.pingBuffer.length);
}

async function processMessage(buffer) {
    let message = await avsc.decode(buffer);
    
    if(message.packets.ping) {
        updateLatency(this, message.packets.ping.timestamp);
    } else if(message.packets.inputs) {
        // ensure all late inputs are still processed
        if(game.tick >= message.tick)
            message.tick = game.tick + 1;

        util.setBuffer(this.inputBuffer, message.tick, message);
    }
}

function handleInputs(socket, inputs) {
    if(socket.id < util.MAX_PLAYERS && !(game.scene == "race" && socket.car.ready)) {
        socket.car.inputs = inputs;
    }

    if(game.scene == "lobby" && inputs.enter) {
        if(socket.id < util.MAX_PLAYERS) {
            socket.car.ready = !socket.car.ready;
        } else {
            const id = util.min_missing_id(wss.clients);
            
            if(id < util.MAX_PLAYERS) {
                console.log(`Client ${socket.id} changed ID to ${id}`);
                addPlayer(socket, id);
            }
        }
    }
}

function processClose() {
    console.log(`Client disconnected: ID - ${this.id}`);

    if(this.id < util.MAX_PLAYERS) {
        game.removeCar(this.id);
    }
}

function broadcast(data, pingFlag) {
    let buffer;

    if(pingFlag) {
        data.packets.ping = {
            timestamp: util.getTime(),
            latency: null,
        };
    } else {
        buffer = avsc.encode(data);  
    }

    for(const client of wss.clients) {
        if(pingFlag) {
            data.packets.ping.latency = client.latency;
            buffer = avsc.encode(data);
        }

        client.send(buffer);
    }
}

function addPlayer(socket, id) {
    socket.id = id;
    socket.car = null;
    socket.inputBuffer = [];

    socket.latency = 100;
    socket.pingBuffer = [100];

    if(id < util.MAX_PLAYERS) {
        socket.car = game.createCar(id);
    }

    let bundle = {
        packets: {},
        tick: game.tick,
    };

    game.addPacket(bundle.packets, 'id', id);
    game.addPacket(bundle.packets, 'dynamic');
    game.addPacket(bundle.packets, 'static');

    socket.send(avsc.encode(bundle));
}

let pingTimer = 0;
var timer = new util.interval(16, () => { 
    const curTick = Math.floor(util.getTime() / 16);
    // const loopTime = util.getTime() - timer.baseline;
    const dt = .016;

    while(game.tick < curTick) {
        for(const socket of wss.clients) {
            let message = util.getBuffer(socket.inputBuffer, game.tick);

            if(message && message.tick == game.tick) {
                handleInputs(socket, message.packets.inputs);
            }
        }

        let bundle = game.update(dt);

        pingTimer += dt;
        const pingFlag = pingTimer > .1;

        if(pingTimer > .1)
            pingTimer = 0;

        broadcast(bundle, pingFlag);
        
        game.simulate(dt);

        game.tick++;
    }
});

game.tick = Math.floor(util.getTime() / 16);
timer.run();