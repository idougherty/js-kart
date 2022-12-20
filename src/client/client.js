const Car = require('../shared_modules/car');
const util = require('../shared_modules/util');
const PhysX = require('../shared_modules/physx');
const Vec2D = PhysX.Vec2D;
const PhysObject = PhysX.PhysObject;
const PhysEnv = PhysX.PhysEnv;

const wall_material = {
    density: Infinity,
    restitution: .5,
    sFriction: .24,
    dFriction: .16,
};

class Client {
    constructor() {
        this.tick;
        this.confirmedTick;
        this.delay = 160;     // built in delay to help smooth lag spikes
        this.latency = 40;

        this.state = {
            scene: null,
            cars: {},
            walls: [], 
        };

        this.env = new PhysEnv(1);

        this.stateBuffer = [];
        this.clientBuffer = [];
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
        return (util.getTime() + this.latency) / 16;
    }

    processPacket(packet, event) {
        switch(event) {
            case 'id':
                this.id = packet;
                this.updateViewID();

                console.log("Client ID: " + this.id);
                break;

            // Set the client's car in the current state to history
            case 'rewind':
                let A = this.state.cars[this.id];
                let B = packet;

                if(!A && !B)
                    return;
                
                if(A && !B) {
                    this.env.removeObject(A);
                    delete this.state.cars[this.id];

                    return;
                }
                
                if(!A && B) {
                    this.state.cars[this.id] = new Car(B.pos, B.hue);
                    this.env.addObject(this.state.cars[this.id]);
                }
                
                this.updateCar(this.state.cars[this.id], B);
                break;
            case 'dynamic':
                for(let i = 0; i < util.MAX_PLAYERS; i++) {
                    let A = this.state.cars[i];
                    let B = packet.cars[i];

                    if(!A && !B || i == this.id)
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
            case 'static':
                const changeScene = this.state.scene != packet.scene;    

                if(this.state.scene == "lobby" && packet.scene == "race") {
                    this.freezeTime = 5;
                }

                this.state.scene = packet.scene;
                this.state.walls = [];
                
                for(const border of packet.walls) {
                    let new_border = [];

                    for(const ref of border) {
                        let pos = new Vec2D(ref.pos.x, ref.pos.y);
                        
                        let points = [];
                        for(const point of ref.points) {
                            points.push(new Vec2D(point.x, point.y));
                        }

                        let wall = new PhysObject(pos, points, wall_material);
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

        car.inputs = ref.inputs;

        for(let i = 0; i < car.points.length; i++) {
            car.points[i] = Vec2D.rotate({x: 0, y: 0}, car.shape[i], car.angle);
            car.points[i].add(car.pos);
        }
    }

    resetEnv() {
        console.log("RESET ENV");
        this.env.clearObjects();

        for(const car of Object.values(this.state.cars)) {
            this.env.addObject(car);
        }

        // if(!this.isSpectator && this.state.cars[this.id])
        //     this.env.addObject(this.state.cars[this.id]);

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
            let a = curr[i];
            let b = last[i];

            if(!a)  
                continue;

            if(!b) {
                lerp[i] = a;
                continue;
            }
            
            let obj = util.copyObj(a);
            
            obj.pos.x = b.pos.x * (1 - alpha) + a.pos.x * alpha;
            obj.pos.y = b.pos.y * (1 - alpha) + a.pos.y * alpha;
            obj.vel.x = b.vel.x * (1 - alpha) + a.vel.x * alpha;
            obj.vel.y = b.vel.y * (1 - alpha) + a.vel.y * alpha;
            obj.angle = b.angle * (1 - alpha) + a.angle * alpha;
            obj.rotVel = b.rotVel * (1 - alpha) + a.rotVel * alpha;

            for(let i = 0; i < obj.points.length; i++) {
                obj.points[i] = Vec2D.rotate({x: 0, y: 0}, Car.POINTS[i], obj.angle);
                obj.points[i].add(obj.pos);
            }

            lerp[i] = obj;
        }

        let state = util.copyObj(this.state);
        state.cars = lerp;

        return state;
    }

    copyDynamicState(state) {
        let newState = {};

        newState.cars = {};
        
        for(const [idx, obj] of Object.entries(state.cars)) {
            if(idx == this.idx)
                continue;

            newState.cars[idx] = this.copyCarState(obj);
        }

        return newState;
    }

    copyCarState(car) {
        return {
            angle:  car.angle,
            rotVel: car.rotVel,
            lap:    car.lap,
            ready:  car.ready,
            pos: {
                x:  car.pos.x,
                y:  car.pos.y,
            },
            vel: {
                x:  car.vel.x,
                y:  car.vel.y,
            },
            inputs: {
                up: car.inputs.up,
                down: car.inputs.down,
                left: car.inputs.left,
                right: car.inputs.right,
                shift: car.inputs.shift,
                enter: car.inputs.enter,
            }
        };
    }

    comparePlayerStates(A, B) {
        const t_tolerance = 1;
        const a_tolerance = .1;

        if(!A || !B)
            return false;

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

module.exports = Client;