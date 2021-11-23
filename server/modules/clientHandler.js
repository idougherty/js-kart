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