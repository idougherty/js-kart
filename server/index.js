const avsc = require('./modules/serialize')
const util = require('./modules/util');
const ServerHandler = require('./modules/serverHandler');
const WebSocket = require("ws");

let game = new ServerHandler();

wss = new WebSocket.Server({ port: process.env.PORT || 8181 });

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
    const BUFFER_SIZE = 5;
    let latency = (util.getTime() - timestamp) / 2;

    socket.pingBuffer.push(latency);

    if(socket.pingBuffer.length > BUFFER_SIZE)
        socket.pingBuffer.splice(0, 1);

    socket.latency = 0;
    
    socket.pingBuffer.forEach(val => socket.latency += val / socket.pingBuffer.length);
}

async function processMessage(buffer) {
    let message = await avsc.decode(buffer);

    if(message.ping) {
        updateLatency(this, message.ping);
        return;
    }

    if(message.packets.inputs)
        util.setBuffer(this.inputBuffer, message.tick, message);
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

function broadcast(data) {
    let buffer = avsc.encode(data);

    for(const client of wss.clients) {
        client.send(buffer);
    }
}

function addPlayer(socket, id) {
    socket.id = id;
    socket.car = null;
    socket.inputBuffer = [];

    socket.latency = 5;
    socket.pingBuffer = [5];

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

function pingClient(socket) {
    let data = {
        ping: util.getTime(),
        latency: socket.latency,
    };

    // socket.send(avsc.encode(data));
}

let pingTimer = 0;
var timer = new util.interval(16, () => { 
    const curTick = Math.floor(util.getTime() / 16);
    const loopTime = util.getTime() - timer.baseline;
    const dt = .016;

    while(game.tick < curTick) {
        for(const socket of wss.clients) {
            let message = util.getBuffer(socket.inputBuffer, game.tick);

            if(message && message.tick == game.tick) {
                handleInputs(socket, message.packets.inputs);
            }
        }

        let bundle = game.update(dt);
        broadcast(bundle);
        
        game.simulate(dt);

        game.tick++;
    }

    pingTimer += loopTime;

    if(pingTimer > 1000) {
        pingTimer = 0;

        for(const client of wss.clients) {
            pingClient(client);
        }
    }
});

game.tick = Math.floor(util.getTime() / 16);
timer.run();