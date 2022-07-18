const PhysX = require('./physx');
const Vec2D = PhysX.Vec2D;

//https://github.com/josephg/noisejs/blob/master/perlin.js

/*
 * A speed-improved perlin and simplex noise algorithms for 2D.
 *
 * Based on example code by Stefan Gustavson (stegu@itn.liu.se).
 * Optimisations by Peter Eastman (peastman@drizzle.stanford.edu).
 * Better rank ordering method by Stefan Gustavson in 2012.
 * Converted to Javascript by Joseph Gentle.
 *
 * Version 2012-03-09
 *
 * This code was placed in the public domain by its original author,
 * Stefan Gustavson. You may use it as you see fit, but
 * attribution is appreciated.
 *
 */

var mod = global.noise = {};

function Grad(x, y, z) {
    this.x = x; this.y = y; this.z = z;
}

Grad.prototype.dot2 = function(x, y) {
    return this.x*x + this.y*y;
};

Grad.prototype.dot3 = function(x, y, z) {
    return this.x*x + this.y*y + this.z*z;
};

var grad3 = [new Grad(1,1,0),new Grad(-1,1,0),new Grad(1,-1,0),new Grad(-1,-1,0),
                new Grad(1,0,1),new Grad(-1,0,1),new Grad(1,0,-1),new Grad(-1,0,-1),
                new Grad(0,1,1),new Grad(0,-1,1),new Grad(0,1,-1),new Grad(0,-1,-1)];

var p = [151,160,137,91,90,15,
131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,
190, 6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,
88,237,149,56,87,174,20,125,136,171,168, 68,175,74,165,71,134,139,48,27,166,
77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,
102,143,54, 65,25,63,161, 1,216,80,73,209,76,132,187,208, 89,18,169,200,196,
135,130,116,188,159,86,164,100,109,198,173,186, 3,64,52,217,226,250,124,123,
5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,
223,183,170,213,119,248,152, 2,44,154,163, 70,221,153,101,155,167, 43,172,9,
129,22,39,253, 19,98,108,110,79,113,224,232,178,185, 112,104,218,246,97,228,
251,34,242,193,238,210,144,12,191,179,162,241, 81,51,145,235,249,14,239,107,
49,192,214, 31,181,199,106,157,184, 84,204,176,115,121,50,45,127, 4,150,254,
138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180];
// To remove the need for index wrapping, double the permutation table length
var perm = new Array(512);
var gradP = new Array(512);

// This isn't a very good seeding function, but it works ok. It supports 2^16
// different seed values. Write something better if you need more seeds.
mod.seed = function(seed) {
    if(seed > 0 && seed < 1) {
        // Scale the seed out
        seed *= 65536;
    }

    seed = Math.floor(seed);
    if(seed < 256) {
        seed |= seed << 8;
    }

    for(var i = 0; i < 256; i++) {
        var v;
        if (i & 1) {
            v = p[i] ^ (seed & 255);
        } else {
            v = p[i] ^ ((seed>>8) & 255);
        }

        perm[i] = perm[i + 256] = v;
        gradP[i] = gradP[i + 256] = grad3[v % 12];
    }
};

mod.seed(0);

// Skewing and unskewing factors for 2, 3, and 4 dimensions
var F2 = 0.5*(Math.sqrt(3)-1);
var G2 = (3-Math.sqrt(3))/6;

var F3 = 1/3;
var G3 = 1/6;

// 2D simplex noise
mod.simplex2 = function(xin, yin) {
    var n0, n1, n2; // Noise contributions from the three corners
    // Skew the input space to determine which simplex cell we're in
    var s = (xin+yin)*F2; // Hairy factor for 2D
    var i = Math.floor(xin+s);
    var j = Math.floor(yin+s);
    var t = (i+j)*G2;
    var x0 = xin-i+t; // The x,y distances from the cell origin, unskewed.
    var y0 = yin-j+t;
    // For the 2D case, the simplex shape is an equilateral triangle.
    // Determine which simplex we are in.
    var i1, j1; // Offsets for second (middle) corner of simplex in (i,j) coords
    if(x0>y0) { // lower triangle, XY order: (0,0)->(1,0)->(1,1)
        i1=1; j1=0;
    } else {    // upper triangle, YX order: (0,0)->(0,1)->(1,1)
        i1=0; j1=1;
    }
    // A step of (1,0) in (i,j) means a step of (1-c,-c) in (x,y), and
    // a step of (0,1) in (i,j) means a step of (-c,1-c) in (x,y), where
    // c = (3-sqrt(3))/6
    var x1 = x0 - i1 + G2; // Offsets for middle corner in (x,y) unskewed coords
    var y1 = y0 - j1 + G2;
    var x2 = x0 - 1 + 2 * G2; // Offsets for last corner in (x,y) unskewed coords
    var y2 = y0 - 1 + 2 * G2;
    // Work out the hashed gradient indices of the three simplex corners
    i &= 255;
    j &= 255;
    var gi0 = gradP[i+perm[j]];
    var gi1 = gradP[i+i1+perm[j+j1]];
    var gi2 = gradP[i+1+perm[j+1]];
    // Calculate the contribution from the three corners
    var t0 = 0.5 - x0*x0-y0*y0;
    if(t0<0) {
        n0 = 0;
    } else {
        t0 *= t0;
        n0 = t0 * t0 * gi0.dot2(x0, y0);  // (x,y) of grad3 used for 2D gradient
    }
    var t1 = 0.5 - x1*x1-y1*y1;
    if(t1<0) {
        n1 = 0;
    } else {
        t1 *= t1;
        n1 = t1 * t1 * gi1.dot2(x1, y1);
    }
    var t2 = 0.5 - x2*x2-y2*y2;
    if(t2<0) {
        n2 = 0;
    } else {
        t2 *= t2;
        n2 = t2 * t2 * gi2.dot2(x2, y2);
    }
    // Add contributions from each corner to get the final noise value.
    // The result is scaled to return values in the interval [-1,1].
    return 70 * (n0 + n1 + n2);
};

// 3D simplex noise
mod.simplex3 = function(xin, yin, zin) {
    var n0, n1, n2, n3; // Noise contributions from the four corners

    // Skew the input space to determine which simplex cell we're in
    var s = (xin+yin+zin)*F3; // Hairy factor for 2D
    var i = Math.floor(xin+s);
    var j = Math.floor(yin+s);
    var k = Math.floor(zin+s);

    var t = (i+j+k)*G3;
    var x0 = xin-i+t; // The x,y distances from the cell origin, unskewed.
    var y0 = yin-j+t;
    var z0 = zin-k+t;

    // For the 3D case, the simplex shape is a slightly irregular tetrahedron.
    // Determine which simplex we are in.
    var i1, j1, k1; // Offsets for second corner of simplex in (i,j,k) coords
    var i2, j2, k2; // Offsets for third corner of simplex in (i,j,k) coords
    if(x0 >= y0) {
        if(y0 >= z0)      { i1=1; j1=0; k1=0; i2=1; j2=1; k2=0; }
        else if(x0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=0; k2=1; }
        else              { i1=0; j1=0; k1=1; i2=1; j2=0; k2=1; }
    } else {
        if(y0 < z0)      { i1=0; j1=0; k1=1; i2=0; j2=1; k2=1; }
        else if(x0 < z0) { i1=0; j1=1; k1=0; i2=0; j2=1; k2=1; }
        else             { i1=0; j1=1; k1=0; i2=1; j2=1; k2=0; }
    }
    // A step of (1,0,0) in (i,j,k) means a step of (1-c,-c,-c) in (x,y,z),
    // a step of (0,1,0) in (i,j,k) means a step of (-c,1-c,-c) in (x,y,z), and
    // a step of (0,0,1) in (i,j,k) means a step of (-c,-c,1-c) in (x,y,z), where
    // c = 1/6.
    var x1 = x0 - i1 + G3; // Offsets for second corner
    var y1 = y0 - j1 + G3;
    var z1 = z0 - k1 + G3;

    var x2 = x0 - i2 + 2 * G3; // Offsets for third corner
    var y2 = y0 - j2 + 2 * G3;
    var z2 = z0 - k2 + 2 * G3;

    var x3 = x0 - 1 + 3 * G3; // Offsets for fourth corner
    var y3 = y0 - 1 + 3 * G3;
    var z3 = z0 - 1 + 3 * G3;

    // Work out the hashed gradient indices of the four simplex corners
    i &= 255;
    j &= 255;
    k &= 255;
    var gi0 = gradP[i+   perm[j+   perm[k   ]]];
    var gi1 = gradP[i+i1+perm[j+j1+perm[k+k1]]];
    var gi2 = gradP[i+i2+perm[j+j2+perm[k+k2]]];
    var gi3 = gradP[i+ 1+perm[j+ 1+perm[k+ 1]]];

    // Calculate the contribution from the four corners
    var t0 = 0.6 - x0*x0 - y0*y0 - z0*z0;
    if(t0<0) {
        n0 = 0;
    } else {
        t0 *= t0;
        n0 = t0 * t0 * gi0.dot3(x0, y0, z0);  // (x,y) of grad3 used for 2D gradient
    }
    var t1 = 0.6 - x1*x1 - y1*y1 - z1*z1;
    if(t1<0) {
        n1 = 0;
    } else {
        t1 *= t1;
        n1 = t1 * t1 * gi1.dot3(x1, y1, z1);
    }
    var t2 = 0.6 - x2*x2 - y2*y2 - z2*z2;
    if(t2<0) {
        n2 = 0;
    } else {
        t2 *= t2;
        n2 = t2 * t2 * gi2.dot3(x2, y2, z2);
    }
    var t3 = 0.6 - x3*x3 - y3*y3 - z3*z3;
    if(t3<0) {
        n3 = 0;
    } else {
        t3 *= t3;
        n3 = t3 * t3 * gi3.dot3(x3, y3, z3);
    }
    // Add contributions from each corner to get the final noise value.
    // The result is scaled to return values in the interval [-1,1].
    return 32 * (n0 + n1 + n2 + n3);

};

// ##### Perlin noise stuff

function fade(t) {
    return t*t*t*(t*(t*6-15)+10);
}

function lerp(a, b, t) {
    return (1-t)*a + t*b;
}

// 2D Perlin Noise
mod.perlin2 = function(x, y) {
    // Find unit grid cell containing point
    var X = Math.floor(x), Y = Math.floor(y);
    // Get relative xy coordinates of point within that cell
    x = x - X; y = y - Y;
    // Wrap the integer cells at 255 (smaller integer period can be introduced here)
    X = X & 255; Y = Y & 255;

    // Calculate noise contributions from each of the four corners
    var n00 = gradP[X+perm[Y]].dot2(x, y);
    var n01 = gradP[X+perm[Y+1]].dot2(x, y-1);
    var n10 = gradP[X+1+perm[Y]].dot2(x-1, y);
    var n11 = gradP[X+1+perm[Y+1]].dot2(x-1, y-1);

    // Compute the fade curve value for x
    var u = fade(x);

    // Interpolate the four results
    return lerp(
        lerp(n00, n10, u),
        lerp(n01, n11, u),
        fade(y));
};

// 3D Perlin Noise
mod.perlin3 = function(x, y, z) {
    // Find unit grid cell containing point
    var X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    // Get relative xyz coordinates of point within that cell
    x = x - X; y = y - Y; z = z - Z;
    // Wrap the integer cells at 255 (smaller integer period can be introduced here)
    X = X & 255; Y = Y & 255; Z = Z & 255;

    // Calculate noise contributions from each of the eight corners
    var n000 = gradP[X+  perm[Y+  perm[Z  ]]].dot3(x,   y,     z);
    var n001 = gradP[X+  perm[Y+  perm[Z+1]]].dot3(x,   y,   z-1);
    var n010 = gradP[X+  perm[Y+1+perm[Z  ]]].dot3(x,   y-1,   z);
    var n011 = gradP[X+  perm[Y+1+perm[Z+1]]].dot3(x,   y-1, z-1);
    var n100 = gradP[X+1+perm[Y+  perm[Z  ]]].dot3(x-1,   y,   z);
    var n101 = gradP[X+1+perm[Y+  perm[Z+1]]].dot3(x-1,   y, z-1);
    var n110 = gradP[X+1+perm[Y+1+perm[Z  ]]].dot3(x-1, y-1,   z);
    var n111 = gradP[X+1+perm[Y+1+perm[Z+1]]].dot3(x-1, y-1, z-1);

    // Compute the fade curve value for x, y, z
    var u = fade(x);
    var v = fade(y);
    var w = fade(z);

    // Interpolate
    return lerp(
        lerp(
        lerp(n000, n100, u),
        lerp(n001, n101, u), w),
        lerp(
        lerp(n010, n110, u),
        lerp(n011, n111, u), w),
        v);
};

function getAngle(vertex, point1, point2) {
    const theta1 = Math.atan2(point1.y - vertex.y, point1.x - vertex.x);
    const theta2 = Math.atan2(point2.y - vertex.y, point2.x - vertex.x);

    let diff = modulo(theta2 - theta1 + Math.PI, Math.PI * 2) - Math.PI;
    diff = diff < -Math.PI ? diff + Math.PI * 2 : diff;
    return diff < -Math.PI ? diff + Math.PI * 2 : diff;
}

function modulo(n, m) {
    return ((n % m) + m) % m;
}

class Straightaway {
    constructor(startPoint, endPoint) {
        this.p1 = startPoint;
        this.p2 = endPoint;
        this.length = Vec2D.distance(this.p1, this.p2);
    }

    draw(ctx) {
        ctx.moveTo(this.p1.x, this.p1.y);
        ctx.lineTo(this.p2.x, this.p2.y);
    }
}

class Corner {
    constructor(startPoint, endPoint, focus) {
        this.p1 = startPoint;
        this.p2 = endPoint;
        this.focus = focus;

        this.radius = Vec2D.distance(startPoint, focus);
        this.theta = getAngle(focus, startPoint, endPoint);
        this.length = this.radius * this.theta;

        this.startAngle = Math.atan2(startPoint.y - focus.y, startPoint.x - focus.x);
        this.endAngle = this.startAngle + this.theta;
        this.counterClockwise = Math.sign(this.theta) < 0;
    }

    draw(ctx) {
        ctx.arc(this.focus.x, this.focus.y, this.radius, this.startAngle, this.endAngle, this.counterClockwise);
    }
}

class Track {
    constructor(center = new Vec2D(0, 0)) {
        this.parts = [];
        this.width = 18;
        this.center = center;

        this.innerWall = [];
        this.outerWall = [];

        let success = false;
        while(!success) {
            this.seedPoints = this.generateSeedPoints(20);
            success = this.generateTrack();
        }

        const spawnPart = this.parts[this.parts.length - 1];

        this.spawn = {
            x: spawnPart.p1.x,
            y: spawnPart.p1.y,
            d: Math.atan2(spawnPart.p2.y - spawnPart.p1.y, spawnPart.p2.x - spawnPart.p1.x),
        };
    }

    generateTrack() {
        let lastPoint = null;

        for(let i = 0; i < this.seedPoints.length; i++) {
            const vertex = this.seedPoints[i];
            const p1 = this.seedPoints[modulo(i - 1, this.seedPoints.length)];
            const p2 = this.seedPoints[modulo(i + 1, this.seedPoints.length)];

            const theta1 = Math.atan2(p1.y - vertex.y, p1.x - vertex.x);
            const theta2 = Math.atan2(p2.y - vertex.y, p2.x - vertex.x);
            const bisector = getAngle(vertex, p1, p2) / 2;
            
            // const dist = Math.min(Point.distance(vertex, p1), Point.distance(vertex, p2));
            const leg = 20;//Math.max(Math.random() * dist/2, 20);

            const middle = Math.abs(leg / Math.cos(bisector));

            const x1 = Math.cos(theta1) * leg + vertex.x;
            const y1 = Math.sin(theta1) * leg + vertex.y;
            const startPoint = new Vec2D(x1, y1);

            const x2 = Math.cos(theta2) * leg + vertex.x;
            const y2 = Math.sin(theta2) * leg + vertex.y;
            const endPoint = new Vec2D(x2, y2);

            const x3 = Math.cos(theta1 + bisector) * middle + vertex.x;
            const y3 = Math.sin(theta1 + bisector) * middle + vertex.y;
            const focus = new Vec2D(x3, y3);

            if(lastPoint) {
                this.parts.push(new Straightaway(lastPoint, startPoint));
            }

            this.parts.push(new Corner(startPoint, endPoint, focus));

            lastPoint = endPoint;
        }

        if(this.parts.length == 0)
            return false;

        this.parts.push(new Straightaway(lastPoint, this.parts[0].p1));

        return true;
    }

    generateSeedPoints(turns) {
        let points = [];
        let radius = 100;
        let minTheta = Math.PI/10;
        
        for(let i = 0; i < turns; i++) {
            let theta = Math.random() * Math.PI * 2;

            let distanced = false;
            let depth = 0;

            while(!distanced) {
                depth++;
                distanced = true;
                for(const element of points) {
                    if(Math.abs(element[1] - theta) < minTheta) {
                        distanced = false;
                        theta = Math.random() * Math.PI * 2;
                    }
                }

                if(depth > 50) {
                    break;
                }
            }
            if(!distanced) {
                break;
            }

            let nx = Math.cos(theta) * radius + this.center.x;
            let ny = Math.sin(theta) * radius + this.center.y;

            points.push([new Vec2D(nx, ny), theta]);
        }

        points.sort((a, b) => a[1] - b[1]);
        points = points.map(x => x[0]);

        //warp points
        points = Track.perlinIterate(points, 10, 20, .001);
        points = Track.perlinIterate(points, 10, 4, .01);
        points = Track.perlinIterate(points, 10, 1, .1);

        //recenter points
        let offset = Track.getCenter(points);
        for(const point of points) {
            point.x += this.center.x - offset.x;
            point.y += this.center.y - offset.y;
        }

        //apply separation forces
        let separated = false;
        while(!separated) {
            separated = true;
            for(const point of points) {
                const v = Track.getSeparationVector(point, points);
                point.x += v.x;
                point.y += v.y;

                if(v.x != 0 || v.y != 0) {
                    separated = false;
                }
            }
        }

        //straighten edges
        points = Track.cleanTrack(points);

        return points;
    }

    static cleanTrack(points) {
        let straight = false;

        while(!straight) {
            straight = true;
            for(let i = 0; i < points.length; i++) {
                const vertex = points[i];
                const p1 = points[modulo(i - 1, points.length)];
                const p2 = points[modulo(i + 1, points.length)];
                
                const theta = Math.abs(getAngle(vertex, p1, p2));

                if(theta > Math.PI * .9 || theta < 1.1) {
                    points.splice(i, 1);
                    straight = false;
                    i--;
                }
            }
        }

        return points;
    }

    static getCenter(points) {
        let center = new Vec2D(0, 0);
        
        for(const point of points) {
            center.x += point.x / points.length;
            center.y += point.y / points.length;
        }

        return center;
    }

    static perlinIterate(points, iterations, steps, warpFactor) {
        noise.seed(Math.random());

        for (let i = 0; i < iterations; i++) {
            for (const point of points) {
                point.x += noise.simplex2(point.x * warpFactor, point.y * warpFactor) * steps;
                point.y += noise.simplex2(-point.x * warpFactor, -point.y * warpFactor) * steps;
            }
        }

        return points;
    }
    
	static normalize (x, y) {
		const dist = Math.sqrt(x*x + y*y);

		if(dist == 0) return [0, 0];

		return [x/dist, y/dist];
    }
    
    static getSeparationVector(point, cluster) {
		let neighbors = 0;
		let xForce = 0;
		let yForce = 0;

		for(let i = 0; i < cluster.length; i++) {
			const xDif = point.x - cluster[i].x;
			const yDif = point.y - cluster[i].y;
			const dist = xDif*xDif + yDif*yDif;
			const minDist = 50;

			if(cluster[i] != point && dist < minDist*minDist) {
				neighbors++;

				xForce += xDif;
				yForce += yDif;
			}
		}

		if(neighbors == 0) return new Vec2D(0, 0);
		 
		xForce /= neighbors;	
        yForce /= neighbors;
        
        const vector = this.normalize(xForce, yForce);

		return new Vec2D(vector[0], vector[1]);
	}

    static genMeshCorner(corner, offset) {
        let points = [];
    
        const radius = (corner.theta > 0) ? corner.radius + offset : corner.radius - offset;
        const freq = 24 / (2 * Math.PI);
        const pointAmt = Math.ceil(Math.abs(corner.theta) * freq);
        const dtheta = corner.theta / pointAmt;
        let theta = corner.startAngle;
    
        for(let i = 0; i <= pointAmt; i++) {
            const nx = corner.focus.x + radius * Math.cos(theta);
            const ny = corner.focus.y + radius * Math.sin(theta);
    
            points.push(new Vec2D(nx, ny));
    
            theta += dtheta;
        }
    
        return points;
    }
    
    static genMesh(track) {
        const offset = track.width / 2;
        const wallThickness = 2;
        let innerShape = [[], []];
        let outerShape = [[], []];
    
        for(const part of track.parts) {
            if(part instanceof Corner) {
                innerShape[0].push(...Track.genMeshCorner(part, -offset));
                innerShape[1].push(...Track.genMeshCorner(part, -offset - wallThickness));

                outerShape[1].push(...Track.genMeshCorner(part, offset));
                outerShape[0].push(...Track.genMeshCorner(part, offset + wallThickness));
            }
        }

        let innerWallPts = [];
        let outerWallPts = [];
        
        const length = innerShape[0].length;
        for(let cur = 0; cur < length; cur++) {
            let next = cur + 1 < length ? cur + 1 : 0;
            innerWallPts[cur] = [innerShape[0][cur],
                                 innerShape[1][cur],
                                 innerShape[1][next],
                                 innerShape[0][next]];
        }
        
        for(let cur = 0; cur < length; cur++) {
            let next = cur + 1 < length ? cur + 1 : 0;
            outerWallPts[cur] = [outerShape[0][cur],
                                 outerShape[1][cur],
                                 outerShape[1][next],
                                 outerShape[0][next]];
        }

        track.innerWall = innerWallPts;
        track.outerWall = outerWallPts;
    }

    draw(ctx) {
        ctx.strokeStyle = "#080F0F";
        ctx.lineWidth = this.width;

        let h = 0;
        for(const part of this.parts) {
            h += 360 / this.parts.length;
            ctx.strokeStyle = "hsl("+h+", 50%, 50%)";
            ctx.beginPath();
            part.draw(ctx);
            ctx.stroke();
        }
    }

    drawMesh(ctx) {
        ctx.strokeStyle = "cyan";
        ctx.lineWidth = 1;

        for(const pts of this.innerWall) {
            ctx.beginPath();
            for(const point of pts) {
                ctx.lineTo(point.x, point.y);
            }
            ctx.closePath();
            ctx.stroke();
        }

        for(const pts of this.outerWall) {
            ctx.beginPath();
            for(const point of pts) {
                ctx.lineTo(point.x, point.y);
            }
            ctx.closePath();
            ctx.stroke();
        }
    }
}

module.exports = Track;