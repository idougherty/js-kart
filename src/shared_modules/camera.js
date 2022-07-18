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
        this.scale = 1;

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

    drawError(error) {
        this.ctx.globalCompositeOperation = "source-over";
        this.ctx.fillStyle = "#121212";
        
        this.ctx.fillRect(-this.canvas.width * .5, -this.canvas.height * .5, this.canvas.width, this.canvas.height);

        this.ctx.globalCompositeOperation = "lighter";
        this.ctx.shadowBlur = 4;

        this.ctx.fillStyle = `hsl(0, 30%, 60%)`;
        this.ctx.shadowColor = `hsl(0, 30%, 50%)`;
        this.ctx.font = "bold 24px Share Tech Mono";

        this.ctx.fillText('Could not connect to:', 0, -20);
        this.ctx.fillText(error.target.url, 0, 20);
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