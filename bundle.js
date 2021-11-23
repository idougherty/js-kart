(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
const util = require('./server/modules/util');
const ClientHandler = require('./server/modules/clientHandler');
const Camera = require('./server/modules/camera');

const socket = new WebSocket("ws://localhost:8181");
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

socket.onmessage = event => {
    let data = util.deserialize(event.data);

    // if message is a ping request answer with a pong
    if(data.ping) {
        game.latency = (game.id+1) * 10;//data.latency;
        socket.send(util.serialize(data));
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

        if(message.packets[1]) {
            const buffered = util.getBuffer(game.stateBuffer, message.tick);
            if(buffered) {
                if(game.compareDynamicStates(buffered, message.packets[1].data)) {
                    rewind = game.tick;
                    auth_state = null;
                } else {
                    rewind = message.tick;
                    auth_state = message.packets[1];
                }
            } else {
                auth_state = message.packets[1];
            }
        }

        if(message.packets[0])
            game.processPacket(message.packets[0], 0);
        
        if(message.packets[2])
            game.processPacket(message.packets[2], 2);
    }

    if(auth_state)
        game.processPacket(auth_state, 1);

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
            0: inputs, 
        },
        tick: game.tick,
    }

    const message = util.serialize(bundle);
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

let delay = 0;
function gameLoop() {
    const dt = .016;
    const curTick = Math.floor(game.getTick());
    const alpha = game.getTick() - curTick;
    
    if(curTick - game.tick > 128)
        game.tick = curTick - 128;

    if(messages.length > 0)
        delay = game.tick - messages[messages.length - 1].tick;

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

    if(rewind < game.tick)
        console.log("Rewind!");

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
},{"./server/modules/camera":2,"./server/modules/clientHandler":4,"./server/modules/util":6}],2:[function(require,module,exports){
let PhysX = require("./physx");
let Vec2D = PhysX.Vec2D;

function num_to_place(num) {
    switch(num) {
        case 1:
            return "1st";
        case 2:
            return "2nd";
        case 3:
            return "3rd";
        default:
            return num+"th";
    }
}

class Camera {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.angle = 0;
        this.x = 0;
        this.y = 0;
        this.scale = 0;

        this.offset = 0;

        this.target = {
            angle: 0,
            x: 0,
            y: 0,
            scale: 1,
        };

        this.ctx.lineCap = "round";
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.translate(canvas.width * .5, this.canvas.height * .5);
    }

    update(car, dt) {
        const followFactor = 8 * dt;

        this.target.angle = car.angle + car.rotVel / 6;
        this.target.x = car.pos.x + car.vel.x / 6;
        this.target.y = car.pos.y + car.vel.y / 6;
        this.target.scale = 1 / (1.7 + Vec2D.mag(car.vel) / 2400);
    
        this.angle += (this.target.angle - this.angle) * followFactor;
        this.x += (this.target.x - this.x) * followFactor;
        this.y += (this.target.y - this.y) * followFactor;
        this.scale += (this.target.scale - this.scale) * followFactor * .2;
    }

    drawWalls(walls) {
        let hue = 0;
        this.ctx.lineWidth = 6;

        for(const wall of walls)  {
            this.ctx.shadowColor = `hsl(${hue}, 100%, 50%)`;
            this.ctx.strokeStyle = `hsl(${hue}, 50%, 85%)`;

            this.ctx.beginPath();
            this.ctx.moveTo(wall.points[1].x, wall.points[1].y);
            this.ctx.lineTo(wall.points[2].x, wall.points[2].y);

            this.ctx.moveTo(wall.points[0].x, wall.points[0].y);
            this.ctx.lineTo(wall.points[3].x, wall.points[3].y);
            
            this.ctx.closePath();
            this.ctx.stroke();

            hue += 360 / walls.length;
        }
    }

    drawStartLine(walls) {
        this.ctx.strokeStyle = `hsl(0, 0%, 15%)`;
        this.ctx.shadowColor = `hsl(0, 0%, 15%)`;

        this.offset++;
        this.ctx.lineDashOffset = this.offset;
        this.ctx.lineCap = "butt";

        const size = 30;
        this.ctx.lineWidth = size;
        this.ctx.setLineDash([size, size]);
        const len = walls[0].length - 1;
        
        const p1 = walls[1][len].points[1];
        const p2 = walls[0][len].points[0];

        const slope = Vec2D.normalize({
                        x: p1.x - p2.x,
                        y: p1.y - p2.y,
                    });

        const perp = new Vec2D(-slope.y, slope.x);
        const offset = perp.mult(size);

        this.ctx.beginPath();
        this.ctx.moveTo(p1.x, p1.y);
        this.ctx.lineTo(p2.x, p2.y);
        this.ctx.stroke();

        this.ctx.lineDashOffset = this.offset + size;

        this.ctx.beginPath();
        this.ctx.moveTo(p1.x + offset.x, p1.y + offset.y);
        this.ctx.lineTo(p2.x + offset.x, p2.y + offset.y);
        this.ctx.stroke();

        this.ctx.setLineDash([]);
        this.ctx.lineCap = "round";
    }
    
    drawObject(obj, color, lineWidth = 2) {
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = lineWidth;

        this.ctx.beginPath();
        for(const point of obj.points) {
            this.ctx.lineTo(point.x, point.y);
        }
        this.ctx.closePath();
        this.ctx.stroke();
    }

    drawPlaces(state, _id) {
        for(const [id,  car] of Object.entries(state.cars)) {
            if(car.lap == -1)
                continue;

            this.ctx.fillStyle = `hsl(${car.hue}, 100%, 90%)`;
            this.ctx.shadowColor = `hsl(${car.hue}, 100%, 50%)`;
            this.ctx.font = "bold 24px Share Tech Mono";

            this.ctx.fillText(num_to_place(car.lap), car.pos.x, car.pos.y - 30);
        }
    }

    drawLobby(state, id, isSpectator) {
        for(const wall of state.walls)
            this.drawWalls(wall);

        this.drawPlaces(state, id)

        for(const car of Object.values(state.cars)) {
            const rd = car.ready ? 1 : .3;
            this.ctx.shadowColor = `hsl(${car.hue}, ${100 * rd}%, ${50 * rd}%)`;
            const color = `hsl(${car.hue}, ${100 * rd}%, ${85 * rd}%)`;
            this.drawObject(car, color, 4);
        }

        if(!isSpectator && !state.cars[id].ready) {
            const car = state.cars[id]

            this.ctx.fillStyle = `hsl(${car.hue}, 100%, 90%)`;
            this.ctx.shadowColor = `hsl(${car.hue}, 100%, 50%)`;
            this.ctx.font = "bold 24px Share Tech Mono";

            this.ctx.fillText("PRESS [ENTER] TO READY", 0, this.canvas.height * -.4);
        }

        if(isSpectator) {
            this.ctx.fillStyle = `hsl(0, 0%, 90%)`;
            this.ctx.shadowColor = `hsl(0, 0%, 50%)`;
            this.ctx.font = "bold 24px Share Tech Mono";

            this.ctx.fillText("SPECTATING", 0, this.canvas.height * -.4);
        }
    }

    drawRace(state, id, isSpectator, freezeTime) {
        this.ctx.translate(0, this.canvas.height * .17);
        this.ctx.scale(this.scale, this.scale);
        this.ctx.rotate(-this.angle - Math.PI/2);
        this.ctx.translate(-this.x, -this.y);

        this.drawStartLine(state.walls);
        
        for(const wall of state.walls)
            this.drawWalls(wall);

        for(const car of Object.values(state.cars)) {
            this.ctx.shadowColor = `hsl(${car.hue}, 100%, 50%)`;
            const color = `hsl(${car.hue}, 100%, 85%)`;
            this.drawObject(car, color, 4);
        }

        this.ctx.translate(this.x, this.y);
        this.ctx.rotate(this.angle + Math.PI/2);
        this.ctx.scale(1/this.scale, 1/this.scale);
        this.ctx.translate(0, -this.canvas.height * .17);
        
        if(isSpectator) {
            const car = state.cars[id];
            this.ctx.fillStyle = `hsl(${car.hue}, ${100}%, ${90}%)`;
            this.ctx.shadowColor = `hsl(${car.hue}, ${100}%, ${50}%)`;
            this.ctx.font = "bold 24px Share Tech Mono";

            this.ctx.fillText(`SPECTATING: CAR ${parseInt(id) + 1}`, 0, this.canvas.height * -.4);
        }

        if(freezeTime > 0) {
            const car = state.cars[id];

            this.ctx.strokeStyle = `hsl(${car.hue}, ${100}%, ${90}%)`;
            this.ctx.shadowColor = `hsl(${car.hue}, ${100}%, ${50}%)`;
            this.ctx.font = "bold 240px Share Tech Mono";
            this.ctx.lineWidth = 1;
            this.ctx.globalAlpha = freezeTime % 1;

            this.ctx.strokeText(Math.ceil(freezeTime), 0, -this.canvas.height / 6);
            
            this.ctx.globalAlpha = 1;
        }
    }

    draw(state, id, isSpectator, freezeTime) {
        this.ctx.globalCompositeOperation = "source-over";
        this.ctx.fillStyle = "#121212";
        
        this.ctx.fillRect(-this.canvas.width * .5, -this.canvas.height * .5, this.canvas.width, this.canvas.height);

        this.ctx.globalCompositeOperation = "lighter";
        this.ctx.shadowBlur = 4;

        if(state.scene == "lobby") {
            this.drawLobby(state, id, isSpectator);
        } else {
            this.drawRace(state, id, isSpectator, freezeTime);
        }
    }
}

module.exports = Camera;
},{"./physx":5}],3:[function(require,module,exports){
const PhysX = require('./physx');
const Vec2D = PhysX.Vec2D;
const PhysObject = PhysX.PhysObject;
const PhysEnv = PhysX.PhysEnv;

class Car extends PhysObject {
    constructor(pos, hue) {
        const pts = [new Vec2D(0, 1),
                     new Vec2D(0, 19),
                     new Vec2D(12, 22),
                     new Vec2D(40, 19),
                     new Vec2D(40, 1),
                     new Vec2D(12, -2),];

        let material = {
            density: 2.5,
            restitution: .35,
            sFriction: .06,
            dFriction: .04,
        };

        super(pos, pts, material);
        this.moi *= 10;

        this.inputs = {
            left: false,
            right: false,
            up: false,
            down: false,
            shift: false,
            enter: false,
        }

        this.ready = false;
        this.hue = hue;
        this.lap = -1;
        this.lastCheckpoint = 0;
    }

    controlPlayer(dt) {
        const speed = Math.sqrt(this.vel.x * this.vel.x + this.vel.y * this.vel.y);
        const maxSpeed = 1000;
        const isDrifting = false;//this.inputs.shift && (this.inputs.left || this.inputs.right);

        const accFactor = isDrifting ? 1200 * dt : 600 * dt;
        const maxRotFactor = isDrifting ? 3.5 : 2.5;
        const maxRot = maxRotFactor * Math.min(speed / 100, 1)
        const rotFactor = 14 * dt;
        const driftFactor = isDrifting ? .96 : .8;
        
        const dx = Math.cos(this.angle);
        const dy = Math.sin(this.angle);

        const dir = new Vec2D(dx, dy);
        const orth = new Vec2D(-dy, dx);

        const fwdSpeed = dir.dot(this.vel);
        const fwdVel = dir.mult(fwdSpeed);

        const orthSpeed = orth.dot(this.vel);
        const orthVel = orth.mult(orthSpeed * driftFactor);

        this.vel = fwdVel.addRet(orthVel);

        if(this.inputs.up && !this.inputs.down && fwdSpeed < maxSpeed) {
            const dx = Math.cos(this.angle) * accFactor;
            const dy = Math.sin(this.angle) * accFactor;
    
            this.vel.add(new Vec2D(dx, dy));
        } else if(this.inputs.down && !this.inputs.up && fwdSpeed > -maxSpeed / 2) {
            const dx = Math.cos(this.angle) * accFactor;
            const dy = Math.sin(this.angle) * accFactor;
    
            this.vel.sub(new Vec2D(dx, dy));
        } else {
            this.vel.x *= isDrifting ? .999 : .99;
            this.vel.y *= isDrifting ? .999 : .99;
        }
    
        if(this.inputs.left && !this.inputs.right && this.rotVel > -maxRot) {
            if(this.rotVel > 0) this.rotVel = 0;
            this.rotVel -= rotFactor;
        } else if(this.inputs.right && !this.inputs.left && this.rotVel < maxRot) {
            if(this.rotVel < 0) this.rotVel = 0;
            this.rotVel += rotFactor;
        } else {
            this.rotVel *= .92;
        }
    }
}

module.exports = Car;
},{"./physx":5}],4:[function(require,module,exports){
const Car = require('./car');
const util = require('./util');
const PhysX = require('./physx');
const Vec2D = PhysX.Vec2D;
const PhysObject = PhysX.PhysObject;
const PhysEnv = PhysX.PhysEnv;

class ClientHandler {
    constructor() {
        this.tick;
        this.confirmedTick;
        this.delay = 1;     // built in delay to help smooth lag spikes
        this.latency = 5;

        this.state = {
            scene: null,
            cars: {},
            walls: [], 
        };

        this.env = new PhysEnv(1);

        this.dynamicFields = ["cars"]; //list of data to predict
        this.stateBuffer = [];
        this.inputBuffer = [];
        
        this.id;
        this.viewID;
        this.isSpectator;
        this.freezeTime = 0;
        
        this.inputs = {
            left: false,
            right: false,
            up: false,
            down: false,
            shift: false,
            enter: false,
        }
    }

    getTick() {
        return util.getTime() / 16 + this.latency + this.delay;
    }

    processPacket(packet, id) {
        switch(id) {
            case 0:
                this.id = packet.data;
                this.updateViewID();
                break;
            case 1:
                for(let i = 0; i < util.MAX_PLAYERS; i++) {
                    let A = this.state.cars[i];
                    let B = packet.data.cars[i];

                    if(!A && !B)
                        continue;
                    
                    if(A && !B) {
                        this.env.removeObject(A);
                        delete this.state.cars[i];

                        continue;
                    }
                    
                    if(!A && B) {
                        this.state.cars[i] = new Car(B.pos, B.hue);
                        this.env.addObject(this.state.cars[i]);
                    }
                    
                    this.updateCar(this.state.cars[i], B);
                }

                break;
            case 2:
                const changeScene = this.state.scene != packet.data.scene;    

                if(this.state.scene == "lobby" && packet.data.scene == "race") {
                    this.freezeTime = 5;
                }

                this.state.scene = packet.data.scene;
                this.state.walls = [];
                
                for(const border of packet.data.walls) {
                    let new_border = [];

                    for(const ref of border) {
                        let pos = new Vec2D(ref.pos.x, ref.pos.y);
                        
                        let points = [];
                        for(const point of ref.points) {
                            points.push(new Vec2D(point.x, point.y));
                        }

                        ref.material.density = Infinity;
                        let wall = new PhysObject(pos, points, ref.material);
                        new_border.push(wall);
                    }

                    this.state.walls.push(new_border);
                }

                if(changeScene)
                    this.resetEnv();
                break;
            default:
        }
    }

    updateCar(car, ref) {
        car.pos = new Vec2D(ref.pos.x, ref.pos.y);
        car.vel = new Vec2D(ref.vel.x, ref.vel.y);

        car.angle = ref.angle;
        car.rotVel = ref.rotVel;

        car.ready = ref.ready;
        car.lap = ref.lap;

        // car.inputs = ref.inputs;

        for(let i = 0; i < car.points.length; i++) {
            car.points[i] = Vec2D.rotate({x: 0, y: 0}, car.shape[i], car.angle);
            car.points[i].add(car.pos);
        }
    }

    resetEnv() {
        this.env.clearObjects();

        for(const car of Object.values(this.state.cars)) {
            this.env.addObject(car);
        }
        
        for(const border of this.state.walls) {
            for(const wall of border) {
                this.env.addObject(wall);
            }
        }
    }

    updateViewID() {
        this.isSpectator = this.id >= util.MAX_PLAYERS || (this.state.scene == "race" && this.state.cars[this.id].ready)
        
        if(!this.isSpectator) {
            this.viewID = this.id;
        } else if(!this.state.cars[this.viewID]) {
            this.viewID = Object.keys(this.state.cars)[0];
        }
    }

    changeViewID() {
        let d = 0;

        if(this.inputs.left)
            d--;

        if(this.inputs.right)
            d++;

        if(d == 0)
            return;
        
        const cars = Object.entries(this.state.cars);

        let idx = 0;
        for(const id of Object.keys(this.state.cars)) {
            if(id == this.viewID) {
                this.viewID = cars[(idx + d + cars.length) % cars.length][0];
                return;
            }
            idx++;
        }
    }

    lerpState(alpha) {
        let buffer = util.getBuffer(this.stateBuffer, this.tick - 1);
        
        if(!buffer)
            return this.state;
        
        let lerp = {};
        let curr = this.state.cars;
        let last = buffer.cars;

        for(let i = 0; i < util.MAX_PLAYERS; i++) {
            if(!curr[i])  
                continue;

            if(!last[i]) {
                lerp[i] = a;
                continue;
            }

            let a = curr[i];
            let b = last[i];
            
            let obj = util.copyObj(a);
            
            obj.pos.x = b.pos.x * alpha + a.pos.x * (1 - alpha);
            obj.pos.y = b.pos.y * alpha + a.pos.y * (1 - alpha);
            obj.vel.x = b.vel.x * alpha + a.vel.x * (1 - alpha);
            obj.vel.y = b.vel.y * alpha + a.vel.y * (1 - alpha);
            obj.angle = b.angle * alpha + a.angle * (1 - alpha);
            obj.rotVel = b.rotVel * alpha + a.rotVel * (1 - alpha);

            lerp[i] = obj;
        }

        let state = util.copyObj(this.state);
        state.cars = lerp;

        return state;
    }

    copyDynamicState(state) {
        let newState = {};

        for(const field of this.dynamicFields) {
            newState[field] = {};
            
            for(const [idx, obj] of Object.entries(state[field])) {
                newState[field][idx] = util.copyObj(obj);
            }
        }

        return newState;
    }

    compareDynamicStates(A_STATE, B_STATE) {
        const t_tolerance = 1;
        const a_tolerance = .1;

        for(const field of this.dynamicFields) {
            const A_LIST = Object.entries(A_STATE[field]);
            const B_LIST = Object.entries(B_STATE[field]);

            if(A_LIST.length != B_LIST.length)
                return false;

            for(let i = 0; i < A_LIST.length; i++) {
                if(A_LIST[i][0] != B_LIST[i][0])
                    return false;

                const A = A_LIST[i][1];
                const B = B_LIST[i][1];

                const tx = A.pos.x - B.pos.x;
                const ty = A.pos.y - B.pos.y;
                const tdif2 = tx * tx + ty * ty;

                const vx = A.vel.x - B.vel.x;
                const vy = A.vel.y - B.vel.y;
                const vdif2 = vx * vx + vy * vy;

                if(tdif2 > t_tolerance * t_tolerance)
                    return false;
                    
                if(vdif2 > t_tolerance * t_tolerance)
                    return false;
                
                if(Math.abs(A.rotVel - B.rotVel) > a_tolerance)
                    return false;

                if(Math.abs(A.angle - B.angle) > a_tolerance)
                    return false;

                if(A.ready != B.ready)
                    return false;

                if(A.lap != B.lap)
                    return false;
            }
        }

        return true;
    }

    update(dt) {
        if(this.freezeTime > 0) {
            this.freezeTime -= dt;
            return;
        }

        for(const [id, car] of Object.entries(this.state.cars)) {
            car.controlPlayer(dt);
        }

        this.env.update(dt);
    }
}

module.exports = ClientHandler;
},{"./car":3,"./physx":5,"./util":6}],5:[function(require,module,exports){
function clip(v1, v2, n, o) {
    let points = [];
    const d1 = n.dot(v1) - o;
    const d2 = n.dot(v2) - o;

    if(d1 >= 0) points.push(v1);

    if(d2 >= 0) points.push(v2);

    if(d1 * d2 < 0) {
        let e = Vec2D.dif(v1, v2);
        const u = d1 / (d1 - d2);
        e = e.mult(u);
        e.add(v1);

        points.push(e);
    }

    return points;
}

function debugLine(p1, p2, ctx, color = "red") {
    ctx.strokeStyle = color;
    ctx.beginPath()
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
}

function insertionSort(arr, lambda = (x) => x) {
    let val, j, i;
    for(i = 1; i < arr.length; i++) {
        val = arr[i];
        j = i - 1;

        while(j >= 0 && lambda(arr[j]) > lambda(val)) {
            arr[j + 1] = arr[j];
            j--;
        }
        arr[j + 1] = val;
    }
}

function polygonSupport(points, d) {
    let furthest = null;
    let dot = -Infinity;

    for(const point of points) {
        const proj = point.dot(d);
        if(proj > dot) {
            furthest = point;
            dot = proj;
        }
    }

    return furthest;
}

function minkowskiDifSupport(s1, s2, d) {
    return Vec2D.dif(polygonSupport(s2.points, d.mult(-1)), polygonSupport(s1.points, d));
}

function mean(arr) {
    let sum = 0;
    for(const el of arr) {
        sum += el;
    }
    return sum / arr.length;
}

function variance(arr) {
    let variance = 0;
    const mean = mean(arr);
    for(const el of arr) {
        const dif = el - mean;
        variance += dif * dif;
    }
    return variance / arr.length;
}

function calculateMassAndMoi(obj) {
    if(obj.material.density == Infinity)
        return [Infinity, Infinity];

    let mass = 0;
    // let center = new Vec2D(0, 0);
    let moi = 0;

    let prev = obj.shape.length - 1;
    for(let cur = 0; cur < obj.shape.length; cur++) {
        const a = obj.shape[prev];
        const b = obj.shape[cur];

        const areaStep = Math.abs(Vec2D.cross(a, b) / 2);
        const massStep = areaStep * obj.material.density;
        // const centerStep = a.addRet(b).div(3);
        const moiStep = massStep / 6 * (a.dot(a) + b.dot(b) + a.dot(b));

        mass += massStep
        // center.add(centerStep);
        moi += moiStep;
    }

    return [mass, moi];
}

const wood = {
    density: 1,
    restitution: .45,
    sFriction: .3,
    dFriction: .2,
};

const rubber = {
    density: 2.5,
    restitution: .95,
    sFriction: .6,
    dFriction: .4,
};

const wall = {
    density: Infinity,
    restitution: .5,
    sFriction: .24,
    dFriction: .16,
};

class Vec2D {
    static rotate(pivot, point, rad) {
        const dx = (point.x - pivot.x);
        const dy = (point.y - pivot.y);

        const sin = Math.sin(rad);
        const cos = Math.cos(rad);

        const nx = dx * cos - dy * sin; 
        const ny = dx * sin + dy * cos;

        return new Vec2D(nx, ny);
    }

    static mag(vec) {
        return Math.sqrt(vec.x * vec.x + vec.y * vec.y);
    }
    
    static distance(v1, v2) {
        return Vec2D.mag(Vec2D.dif(v1, v2));
    }

    static normalize(vec) {
        if(vec.x == 0 && vec.y == 0) return new Vec2D(0, 0);
        const mag = Vec2D.mag(vec);
        return new Vec2D(vec.x / mag, vec.y / mag);
    }

    static dif(v1, v2) {
        return new Vec2D(v2.x - v1.x, v2.y - v1.y);
    }

    static tripleProd(v1, v2, v3) {
        const k = v1.x * v2.y - v1.y * v2.x;
        const nx = -v3.y * k;
        const ny = v3.x * k;
        return new Vec2D(nx, ny, 0);
    }

    static cross(A, B) {
        if(A.x == undefined) {
            // scalar x vector
            return new Vec2D(-A * B.y, A * B.x);
        } else if(B.x == undefined) {
            // vector x scalar
            return new Vec2D(B * A.y, -B * A.x);
        } else {
            // vector x vector
            return A.x * B.y - A.y * B.x;
        }
    }

    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    add(other) {
        this.x += other.x;
        this.y += other.y;
    }

    sub(other) {
        this.x -= other.x;
        this.y -= other.y;
    }

    scale(num) {
        this.x *= num;
        this.y *= num;
    }
    
    addRet(other) {
        return new Vec2D(this.x + other.x, this.y + other.y);
    }

    subRet(other) {
        return new Vec2D(this.x - other.x, this.y - other.y);
    }

    mult(num) {
        return new Vec2D(this.x * num, this.y * num);
    }

    div(num) {
        return new Vec2D(this.x / num, this.y / num);
    }

    dot(other) {
        return this.x * other.x + this.y * other.y;
    }
}

class AABB {

    static findAABB(obj) {
        let b = new Vec2D(Infinity, Infinity);
        let e = new Vec2D(-Infinity, -Infinity);

        for(const point of obj.points) {
            b.x = Math.min(point.x, b.x);
            b.y = Math.min(point.y, b.y);

            e.x = Math.max(point.x, e.x);
            e.y = Math.max(point.y, e.y);
        }

        return new AABB(b, e);
    }

    constructor(b, e) {
        this.b = b;
        this.e = e;
    }

    update(obj) {
        this.b.add(new Vec2D(Infinity, Infinity));
        this.e.add(new Vec2D(-Infinity, -Infinity));

        for(const point of obj.points) {
            this.b.x = Math.min(point.x, this.b.x);
            this.b.y = Math.min(point.y, this.b.y);

            this.e.x = Math.max(point.x, this.e.x);
            this.e.y = Math.max(point.y, this.e.y);
        }
    }

    draw(ctx) {
        ctx.strokeStyle = this.color;
        ctx.strokeRect(this.b.x, this.b.y, this.e.x - this.b.x, this.e.y - this.b.y);
    }
}

class PhysObject {

    static findCOM(points) {
        let COM = new Vec2D(0, 0);
        
        for(const point of points) {
            COM.add(point);
        }

        COM.x /= points.length;
        COM.y /= points.length;

        return COM;
    }

    constructor(pos, points, material = wood) {
        this.force = new Vec2D(0, 0);
        this.acc = new Vec2D(0, 0);
        this.vel = new Vec2D(0, 0);
        this.pos = pos;

        this.torque = 0;
        this.rotAcc = 0;
        this.rotVel = 0;
        this.angle = 0;

        const center = PhysObject.findCOM(points);
        points.forEach((p) => p.sub(center));
        this.shape = points;
        this.points = [];
        for(let i = 0; i < points.length; i++) {
            this.points[i] = Vec2D.rotate(new Vec2D(0, 0), this.shape[i], this.angle);
            this.points[i].add(this.pos);
        }

        this.material = material;
        const [mass, moi] = calculateMassAndMoi(this);

        this.mass = mass;
        this.moi = moi;
        
        this.AABB = AABB.findAABB(this);
        this.func = null;
    }

    // a force consists of a position vector and a direction vector
    applyForce(force) {
        const r = new Vec2D(force.pos.x - this.pos.x, force.pos.y - this.pos.y);

        this.force.add(force.dir);
        this.torque += r.x * force.dir.y - r.y * force.dir.x;
    }

    stepForces(dt) {
        this.acc = this.force.div(this.mass);
        
        if(this.mass == 0)
            this.acc = new Vec2D(0, 0);
        
        this.vel.add(this.acc.mult(dt));
        
        this.pos.add(this.vel.mult(dt));
        
        this.rotAcc = this.torque / this.moi;

        if(this.moi == 0)
            this.rotAcc = 0;
        
        this.rotVel += this.rotAcc * dt;

        this.angle += this.rotVel * dt;

        this.force = new Vec2D(0, 0);
        this.torque = 0;
    }

    update() {
        for(let i = 0; i < this.points.length; i++) {
            this.points[i] = Vec2D.rotate(new Vec2D(0, 0), this.shape[i], this.angle);
            this.points[i].add(this.pos);
        }

        this.AABB.update(this);
    }

    draw(ctx) {
        ctx.strokeStyle = "white";
        ctx.lineWidth = 1.5;

        ctx.beginPath();
        for(const point of this.points) {
            ctx.lineTo(point.x, point.y);
        }
        ctx.closePath();

        ctx.stroke();
    }
}

class PhysEnv {
    constructor(iterations = 1) {
        this.objects = [];
        this.intervals = [];
        this.sweepX = true;

        this.iterations = iterations;
    }

    addObject(obj) {
        let start = [obj.AABB.b, this.objects.length];
        let end = [obj.AABB.e, this.objects.length];
        
        this.intervals.push(start, end);
        this.objects.push(obj);
    }

    removeObject(obj) {
        let idx = -1;
        
        for(let i = 0; i < this.objects.length; i++) {
            if(obj == this.objects[i]) {
                idx = i;
                this.objects.splice(i, 1);
                break;
            }
        }

        for(let i = this.intervals.length - 1; i >= 0; i--) {
            if(idx == this.intervals[i][1]) {
                this.intervals.splice(i, 1);
            } else if(this.intervals[i][1] > idx) {
                this.intervals[i][1]--;
            }
        }
    }

    clearObjects() {
        this.objects = [];
        this.intervals = [];
    }

    sweepAndPrune() {
        let overlaps = [];
        let activeObjects = {};

        if(this.sweepX) {
            insertionSort(this.intervals, (x) => x[0].x);
        } else {
            insertionSort(this.intervals, (x) => x[0].y);
        }

        for(let i = this.intervals.length - 1; i >= 0; i--) {
            const node = this.intervals[i];
            if(activeObjects[node[1]] != null) {
                delete activeObjects[node[1]];
            } else {
                for(const key in activeObjects) {
                    if((this.objects[node[1]].mass == Infinity &&
                        this.objects[activeObjects[key]].mass == Infinity) || 
                       (this.objects[node[1]].mass == 0 &&
                        this.objects[activeObjects[key]].mass == 0))
                        continue;
                    overlaps.push([this.objects[node[1]], this.objects[activeObjects[key]]]);
                }

                activeObjects[node[1]] = node[1];
            }
        }

        // for(const node of this.intervals) {
        //     if(activeObjects[node[1]] != null) {
        //         delete activeObjects[node[1]];
        //     } else {
        //         for(const key in activeObjects) {
        //             overlaps.push([this.objects[node[1]], this.objects[activeObjects[key]]]);
        //         }

        //         activeObjects[node[1]] = node[1];
        //     }
        // }

        return overlaps;
    }

    update(dt) {
        this.stepForces(dt);
        for(let i = 0; i < this.iterations; i++) {
            this.detectCollisions();
        }
    }

    stepForces(dt) {
        for(const obj of this.objects) {
            obj.stepForces(dt);
            obj.update();
        }
    }

    detectCollisions() {
        let simplex = [];
        let possibleCollisions = this.sweepAndPrune();
        for(let [s1, s2] of possibleCollisions) {
            if((simplex = this.GJK(s1, s2))) {
                if(s1.func) s1.func(s1, s2);
                if(s2.func) s2.func(s2, s1);
                
                if(s1.mass == 0 || s2.mass == 0) {
                    continue;
                }

                let [normal, depth] = this.EPA(s1, s2, simplex);
                
                let contacts = this.findContacts(s1, s2, normal);

                if(contacts == null)
                    continue;

                for(const contact of contacts)
                    this.applyImpulses(s1, s2, normal, contact);

                this.resolveIntersections(s1, s2, normal, depth);

                s1.update();
                s2.update();
            }
        }
    }

    resolveIntersections(s1, s2, normal, depth) {
        const slop = .1;
        const percent = .85;
        const correction = Math.max(depth - slop, 0) * percent;
        const totalMass = s1.mass + s2.mass;
        if(s1.mass == Infinity && s2.mass == Infinity) {
            return;
        } else if(s1.mass == Infinity) {
            s2.pos.x += normal.x * correction;
            s2.pos.y += normal.y * correction;
        } else if(s2.mass == Infinity) {
            s1.pos.x -= normal.x * correction;
            s1.pos.y -= normal.y * correction;
        } else {
            s1.pos.x -= normal.x * correction * s2.mass / totalMass;
            s1.pos.y -= normal.y * correction * s2.mass / totalMass;
            
            s2.pos.x += normal.x * correction * s1.mass / totalMass;
            s2.pos.y += normal.y * correction * s1.mass / totalMass;
        }
    }

    applyImpulses(s1, s2, normal, contact) {
        const r1 = Vec2D.dif(s1.pos, contact);
        const v1 = s1.vel.addRet(Vec2D.cross(s1.rotVel, r1));

        const r2 = Vec2D.dif(s2.pos, contact);
        const v2 = s2.vel.addRet(Vec2D.cross(s2.rotVel, r2));

        const abVel = Vec2D.dif(v1, v2);
        const contactVel = abVel.dot(normal);

        if(contactVel >= 0)
            return;

        const armA = Vec2D.cross(r1, normal);
        const armB = Vec2D.cross(r2, normal);

        const rest = Math.min(s1.material.restitution, s2.material.restitution);

        const m = 1 / s1.mass + 1 / s2.mass + armA * armA / s1.moi + armB * armB / s2.moi; 
        const j = (-(rest + 1) * contactVel) / m;
        const impulse = normal.mult(j);

        s1.vel.sub(impulse.div(s1.mass));
        s2.vel.add(impulse.div(s2.mass));
        
        const r1CrossI = Vec2D.cross(r1, impulse);
        const r2CrossI = Vec2D.cross(r2, impulse);

        s1.rotVel -= r1CrossI / s1.moi;
        s2.rotVel += r2CrossI / s2.moi;

        const tangent = Vec2D.normalize(abVel.subRet(normal.mult(contactVel)));
        const jt = -abVel.dot(tangent) / m;

        const mu = Math.sqrt(s1.material.sFriction * s1.material.sFriction + s2.material.sFriction * s2.material.sFriction);

        if(Math.abs(jt) < j * mu) {
            var impulset = tangent.mult(jt);
        } else {
            const dFriction = Math.sqrt(s1.material.dFriction * s1.material.dFriction + s2.material.dFriction * s2.material.dFriction);
            var impulset = tangent.mult(-j * dFriction);
        }

        if(!isFinite(impulset.x) || !isFinite(impulset.y))
            return;

        s1.vel.sub(impulset.div(s1.mass));
        s2.vel.add(impulset.div(s2.mass));

        const r1CrossIt = Vec2D.cross(r1, impulset);
        const r2CrossIt = Vec2D.cross(r2, impulset);

        s1.rotVel -= r1CrossIt / s1.moi;
        s2.rotVel += r2CrossIt / s2.moi;
    }

    findContacts(s1, s2, normal) {
        const [p1, e1] = this.findCollisionEdge(s1, normal);
        const [p2, e2] = this.findCollisionEdge(s2, normal.mult(-1));

        const e1Dif = Vec2D.dif(e1[1], e1[0]);
        const e2Dif = Vec2D.dif(e2[1], e2[0]);

        let ref, pRef, eRef, inc, pInc, eInc;
        if(Math.abs(e1Dif.dot(normal)) <= Math.abs(e2Dif.dot(normal))) {
            pRef = p1;
            eRef = e1;
            ref = e1Dif;

            pInc = p2;
            eInc = e2;
            inc = e2Dif;
        } else {
            pRef = p2;
            eRef = e2;
            ref = e2Dif;

            pInc = p1;
            eInc = e1;
            inc = e1Dif;
        }

        const refV = Vec2D.normalize(ref).mult(-1);
        const o1 = refV.dot(eRef[0]);

        let cp = clip(eInc[0], eInc[1], refV, o1);

        if(cp.length < 2) return;

        const o2 = refV.dot(eRef[1]);
        
        cp = clip(cp[0], cp[1], refV.mult(-1), -o2);
        
        if(cp.length < 2) return;

        let refNorm = Vec2D.cross(ref, -1);
        
        const max = refNorm.dot(pRef);

        if(refNorm.dot(cp[1]) - max < 0)
            cp.splice(1, 1);

        if(refNorm.dot(cp[0]) - max < 0)
            cp.splice(0, 1);
    
        return cp;
    }

    findCollisionEdge(s, normal) {
        let v = null;
        let idx = null;
        let dot = -Infinity;
    
        for(const [i, point] of s.points.entries()) {
            const proj = point.dot(normal);
            if(proj > dot) {
                v = point;
                idx = i;
                dot = proj;
            }
        }
    
        const v0 = s.points[(idx - 1 + s.points.length) % s.points.length];
        const v1 = s.points[(idx + 1) % s.points.length];

        const leftEdge = Vec2D.dif(v, v0);
        const rightEdge = Vec2D.dif(v, v1);

        if(Vec2D.normalize(rightEdge).dot(normal) <= Vec2D.normalize(leftEdge).dot(normal)) {
            return [v, [v0, v], leftEdge];
        } else {
            return [v, [v, v1], rightEdge];
        }
    }

    GJK(s1, s2) {
        let d = Vec2D.normalize(Vec2D.dif(s1.pos, s2.pos));
        let simplex = [minkowskiDifSupport(s1, s2, d)];
        d = Vec2D.dif(simplex[0], new Vec2D(0, 0));

        while(true) {
            d = Vec2D.normalize(d);
            const A = minkowskiDifSupport(s1, s2, d);
            if(A.dot(d) < 0)
                return false;
            simplex.push(A);
            if(this.handleSimplex(simplex, d))
                return simplex;
        }
    }

    handleSimplex(simplex, d) {
        if(simplex.length == 2)
            return this.lineCase(simplex, d);
        return this.triangleCase(simplex, d);
    }

    lineCase(simplex, d) {
        let [B, A] = simplex;
        let AB = Vec2D.dif(A, B);
        let AO = Vec2D.dif(A, new Vec2D(0, 0));
        let ABperp = Vec2D.tripleProd(AB, AO, AB);
        d.x = ABperp.x;
        d.y = ABperp.y;
        return false;
    }

    triangleCase(simplex, d) {
        let [C, B, A] = simplex;

        let AB = Vec2D.dif(A, B);
        let AC = Vec2D.dif(A, C);
        let AO = Vec2D.dif(A, new Vec2D(0, 0));

        let ABperp = Vec2D.tripleProd(AC, AB, AB);
        let ACperp = Vec2D.tripleProd(AB, AC, AC);

        if(ABperp.dot(AO) > 0) {

            simplex.splice(0, 1);

            d.x = ABperp.x;
            d.y = ABperp.y;

            return false;
        } else if(ACperp.dot(AO) > 0) {

            simplex.splice(1, 1);

            d.x = ACperp.x;
            d.y = ACperp.y;

            return false;
        }
        return true;
    }

    // expanding polytope algorithm
    EPA(s1, s2, simplex) {
        while(true) {
            let [edgeDist, edgeNorm, edgeIDX] = this.findClosestEdge(simplex);
            let sup = minkowskiDifSupport(s1, s2, edgeNorm);

            const d = sup.dot(edgeNorm);
            
            if(d - edgeDist <= 0.01) {
                return [edgeNorm, edgeDist];
            } else {
                simplex.splice(edgeIDX, 0, sup);
            }
        }
    }

    findClosestEdge(simplex) {
        let dist = Infinity;
        let normal, idx;

        for(let i = 0; i < simplex.length; i++) {
            const j = (i + 1) % simplex.length;

            const edge = Vec2D.dif(simplex[i], simplex[j]);
            const n = Vec2D.normalize(Vec2D.tripleProd(edge, simplex[i], edge));

            const d = n.dot(simplex[i]);

            if(d < dist) {
                dist = d;
                normal = n;
                idx = j;
            }
        }

        return [dist, normal, idx];
    }

    drawObjects(ctx) {
        for(const obj of this.objects) {
            obj.draw(ctx);
        }
    }
}

exports.Vec2D = Vec2D;
exports.PhysEnv = PhysEnv;
exports.PhysObject = PhysObject;
},{}],6:[function(require,module,exports){
this.CANVAS_WIDTH = 480;
this.CANVAS_HEIGHT = 720;
this.BUFFER_SIZE = 1024
this.MAX_PLAYERS = 5;

this.getTime = () => {
    let d = new Date();
    let t = d.getTime();
    return t;
}

function interval (duration, fn) {
    var _this = this
    this.baseline = undefined
    
    this.run = function(){
        if(_this.baseline === undefined){
            _this.baseline = new Date().getTime()
        }
        fn()
        var end = new Date().getTime()
        _this.baseline += duration
    
        var nextTick = duration - (end - _this.baseline)
        if(nextTick<0){
            nextTick = 0
        }
        
        _this.timer = setTimeout(function(){
            _this.run(end)
        }, nextTick)
    }
  
    this.stop = function(){
        clearTimeout(_this.timer)
    }
}

// TODO: implement avro serialization
this.serialize = (obj) => {
    return JSON.stringify(obj);
}

this.deserialize = (buffer) => {
    return JSON.parse(buffer);
}

this.min_missing_id = (clients, min = 0, offset = 0) => {
    let arr = Array.from(clients).sort((a, b) => a.id - b.id);

    for(var i = 0; i < arr.length - 1; i++) {
        if(arr[i + offset].id != i + min) {
            break;
        }
    }
    return i + min;
}

this.getBuffer = (buffer, id) => {
    return buffer[(id + this.BUFFER_SIZE) % this.BUFFER_SIZE];
}

this.setBuffer = (buffer, id, data) => {
    buffer[(id + this.BUFFER_SIZE) % this.BUFFER_SIZE] = data;
}

this.copyObj = (obj) => {
    return JSON.parse(JSON.stringify(obj));
}

exports = this;
exports.interval = interval;
},{}]},{},[1]);
