const Track = require('../shared_modules/trackGenerator');
const Car = require('../shared_modules/car');
const util = require('../shared_modules/util');
const PhysX = require('../shared_modules/physx');
const Vec2D = PhysX.Vec2D;
const PhysObject = PhysX.PhysObject;
const PhysEnv = PhysX.PhysEnv;

const wall = {
    density: Infinity,
    restitution: .5,
    sFriction: .24,
    dFriction: .16,
};

const cp_material = {
    density: 0,
    restitution: 0,
    sFriction: 0,
    dFriction: 0,
};

const cw = util.CANVAS_WIDTH;
const ch = util.CANVAS_HEIGHT;

const lobby_walls = [
    [new Vec2D(-cw / 2 + 5,  -ch / 2 + 5),
     new Vec2D(-cw / 2 + 30, -ch / 2 + 30),
     new Vec2D( cw / 2 - 30, -ch / 2 + 30),
     new Vec2D( cw / 2 - 5,  -ch / 2 + 5),],

    [new Vec2D(-cw / 2 + 5,   ch / 2 - 5),
     new Vec2D(-cw / 2 + 30,  ch / 2 - 30),
     new Vec2D(-cw / 2 + 30, -ch / 2 + 30),
     new Vec2D(-cw / 2 + 5,  -ch / 2 + 5),],

    [new Vec2D( cw / 2 - 5,  ch / 2 - 5),
     new Vec2D( cw / 2 - 30, ch / 2 - 30),
     new Vec2D(-cw / 2 + 30, ch / 2 - 30),
     new Vec2D(-cw / 2 + 5,  ch / 2 - 5),],

    [new Vec2D(cw / 2 - 5,  -ch / 2 + 5),
     new Vec2D(cw / 2 - 30, -ch / 2 + 30),
     new Vec2D(cw / 2 - 30,  ch / 2 - 30),
     new Vec2D(cw / 2 - 5,   ch / 2 - 5),],
]

class ServerHandler {
    constructor() {
        this.scene = "lobby";
        this.tick = Math.floor(util.getTime() / 16);
        this.numPlayers = 0;

        this.env = new PhysEnv();

        this.cars = {};
        this.track = null;
        this.walls = [];
        this.place = 1;
        this.freezeTime = 0;

        this.initLobby();
    }

    reset() {
        this.env.clearObjects();
        this.track = null;
        this.walls = [];
    }

    initLobby() {
        this.scene = "lobby";

        let carArr = Object.entries(this.cars);
        carArr.sort((a, b) => { return b[1].lap - a[1].lap });

        for(const [id, car] of carArr) {
            const int_id = parseInt(id);

            car.pos = new Vec2D(0, ch * .6 / (util.MAX_PLAYERS + 1) * (int_id + 1) - ch * .3);
            car.vel.x = car.vel.y = car.rotVel = car.angle = 0;
            car.ready = false;

            this.env.addObject(car);
        }

        let wallPoints = lobby_walls;
        this.walls = [[]];

        for(const points of wallPoints) {
            let pos = new Vec2D(0, 0);
            let new_pts = [];

            for(let point of points) {
                pos.add(point);
                new_pts.push(new Vec2D(point.x, point.y));
            }
    
            pos = pos.div(points.length);
    
            let obj = new PhysObject(pos, new_pts, wall);
            this.env.addObject(obj);

            this.walls[0].push(obj);
        }
    }

    initRace() {
        this.scene = "race";
        this.place = 1;
        this.freezeTime = 5;

        this.env.clearObjects();
        this.track = new Track(new Vec2D(0, 0));
        Track.genMesh(this.track);

        const scale = 15;
        this.walls = [[], []];
        this.createWalls(scale);
        this.createCheckpoints();

        let id = 0;

        for(const car of Object.values(this.cars)) {
            car.ready = false;
            car.lap = 0;
            car.lastCheckpoint = 0;

            let dx = ((this.numPlayers-1)/2 - id) * 50 * Math.sin(this.track.spawn.d);
            let dy = ((this.numPlayers-1)/2 - id) * 50 * -Math.cos(this.track.spawn.d);

            car.pos.x = this.track.spawn.x * scale + dx;
            car.pos.y = this.track.spawn.y * scale + dy;
            car.angle = this.track.spawn.d;

            car.vel.x = car.vel.y = car.rotVel = 0;

            this.env.addObject(car);

            id++;
        }

    }

    createCheckpoints() {
        for(let curr = 0; curr < this.walls[0].length; curr++) {
            const next = (curr + 1) % this.walls[0].length;
            

            let points = [this.walls[1][next].points[2].mult(1),
                          this.walls[1][curr].points[2].mult(1),
                          this.walls[0][curr].points[3].mult(1),
                          this.walls[0][next].points[3].mult(1)]; 

            let pos = new Vec2D(0, 0);

            for(let point of points) {
                pos.add(point);
            }
    
            pos = pos.div(points.length);
    
            let cp = new PhysObject(pos, points, cp_material);

            cp.id = (curr + 2 + this.walls[0].length) % this.walls[0].length;
            cp.func = (A, B) => {
                if(B instanceof Car) {
                    if(Math.abs(A.id - B.lastCheckpoint) == 1)
                        B.lastCheckpoint = A.id;

                    if(A.id == 0 && B.lastCheckpoint > 5) {
                        B.lastCheckpoint = 0;
                        B.lap++;

                        if(B.lap >= 3) {
                            B.lap = -1;
                            B.ready = true;
                        }
                    }
                }
            };
    
            this.env.addObject(cp);
        }
    }

    createWalls(scale) {
        let wallArr = [...this.track.innerWall, ...this.track.outerWall];

        for(const [idx, pts] of wallArr.entries()) {

            let pos = new Vec2D(0, 0);
            let objPts = [];
                
            for(let [i, point] of pts.entries()) {
                objPts[i] = point.mult(scale);
                pos.add(objPts[i]);
            }

            pos.x /= pts.length;
            pos.y /= pts.length;
            
            let obj = new PhysObject(pos, objPts, wall);

            const wall_idx = Math.floor(idx * 2 / wallArr.length);

            this.env.addObject(obj);
            this.walls[wall_idx].push(obj);
        }
    }

    createCar(id) {
        const pos = new Vec2D(0, ch * .6 / (util.MAX_PLAYERS + 1) * (id + 1) - ch * .3);
        const hue = 360 / util.MAX_PLAYERS * id;
        const car = new Car(pos, hue);

        this.env.addObject(car);
        this.cars[id] = car;
        this.numPlayers++;

        return car;
    }

    removeCar(id) {
        this.env.removeObject(this.cars[id]);
        
        delete this.cars[id];
        this.numPlayers--;
    }

    addPacket(packets, event, data = null) {
        switch(event) {
            case 'id':
                packets.id = data;
                break;
            case 'dynamic':
                packets.dynamic = {
                    cars: this.cars,
                };
                break;
            case 'static':
                packets.static = {
                    scene: this.scene,
                    walls: this.walls,
                };
                break;
            default:
        }
    }

    lobbyUpdate(packets) {
        let ready = true;
    
        for(const car of Object.values(this.cars)) {
            if(!car.ready) {
                ready = false;
            }
        }

        this.addPacket(packets, 'dynamic');
    
        if(ready && this.numPlayers > 0) {
            this.reset();
            this.initRace();
            packets[2] = this.addPacket(packets, 'static');
        }

        return packets;
    }

    raceUpdate(packets) {
        let ready = true;
        for(const car of Object.values(this.cars)) {
            if(!car.ready) {
                ready = false;
            } else if(car.lap == -1) {
                car.lap = this.place;
                this.place++;
                car.inputs.up = car.inputs.down = car.inputs.right = car.inputs.left = false;
            }
        }

        this.addPacket(packets, 'dynamic');

        if(this.numPlayers == 0 || ready) {
            this.reset();
            this.initLobby();
            this.addPacket(packets, 'static');
        }

        return packets;
    }

    update(dt) {
        let bundle = {
            packets: {
                id: null,
                dynamic: null,
                static: null,
            },
            tick: this.tick, 
        };

        if(this.scene == "lobby") {
            this.lobbyUpdate(bundle.packets);
        } else {
            this.raceUpdate(bundle.packets);
        }

        return bundle;
    }

    simulate(dt) {
        if(this.freezeTime > 0) {
            this.freezeTime -= dt;
            return;
        }

        for(const car of Object.values(this.cars))
            car.controlPlayer(dt);

        this.env.update(dt);
    }
}

module.exports = ServerHandler;