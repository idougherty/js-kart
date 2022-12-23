const PhysX = require('./physx');
const Vec2D = PhysX.Vec2D;
const PhysObject = PhysX.PhysObject;

class Car extends PhysObject {
    static POINTS = [new Vec2D(0, 1),
        new Vec2D(0, 19),
        new Vec2D(12, 22),
        new Vec2D(40, 19),
        new Vec2D(40, 1),
        new Vec2D(12, -2),];

    constructor(pos, hue, material = null) {

        if(!material) {
            material = {
                density: 2.5,
                restitution: .35,
                sFriction: .06,
                dFriction: .04,
            };
        }

        super(pos, Car.POINTS, material);
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
        const isDrifting = false;

        const accFactor = 600 * dt;
        const maxRotFactor = 2.5;
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
    
        const turningLeft = this.inputs.left && !this.inputs.right; 
        const turningRight = !this.inputs.left && this.inputs.right;

        if((turningLeft && fwdSpeed > 0) || (turningRight && fwdSpeed < 0)) {
            if(this.rotVel > 0) this.rotVel = 0;
            if(this.rotVel < -maxRot) this.rotVel = -maxRot;

            this.rotVel -= rotFactor;
        } else if((turningRight && fwdSpeed > 0) || (turningLeft && fwdSpeed < 0)) {
            if(this.rotVel < 0) this.rotVel = 0;
            if(this.rotVel > maxRot) this.rotVel = maxRot;

            this.rotVel += rotFactor;
        } else {
            this.rotVel *= .92;
        }
    }
}

module.exports = Car;