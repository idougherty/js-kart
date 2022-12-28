let avro = require("avsc");
let util = require("./util");


let car_schema = {
    name: '_0',
    default: null,
    type: [ 'null', {
        type: 'record',
        fields: [
            { name: 'ready', type: 'boolean' },
            { name: 'lap', type: 'int' },
            { name: 'hue', type: 'int' },
            { name: 'angle', type: 'double' },
            { name: 'rotVel', type: 'double' },
            { 
                name: 'pos',
                type: {
                    type: 'record',
                    fields: [
                        { name: 'x', type: 'double' },
                        { name: 'y', type: 'double' }
                    ]
                }
            },
            { 
                name: 'vel', 
                type: {
                    type: 'record',
                    fields: [
                        { name: 'x', type: 'double' },
                        { name: 'y', type: 'double' }
                    ]
                }
            },
            {
                name: 'inputs',
                type: ['null', {
                    type: 'record',
                    fields: [
                        { name: 'left',  type: 'boolean' },
                        { name: 'right', type: 'boolean' },
                        { name: 'up',    type: 'boolean' },
                        { name: 'down',  type: 'boolean' },
                        { name: 'shift', type: 'boolean' },
                        { name: 'enter', type: 'boolean' },
                    ]
                }]
            }
        ]
    }]
};

car_schema_list = [];

for(let id = 0; id < util.MAX_PLAYERS; id++) {
    let new_schema = util.copyObj(car_schema);
    new_schema.name = "_" + id;

    car_schema_list.push(new_schema);
}

const BUNDLE_TYPE = avro.Type.forSchema({
    type: 'record',
    fields: [
        { name: 'tick', type: 'long' },
        {
            name: 'packets', 
            type: {
                type: 'record',
                fields: [
                    { name: 'id', default: null, type: ['null', 'int'] },
                    {
                        name: 'dynamic',
                        default: null,
                        type: [ 'null', {
                            type: 'record',
                            fields: [
                                { 
                                    name: 'cars', 
                                    type: {
                                        type: 'record',
                                        fields: car_schema_list,
                                    }
                                }
                            ]
                        }]
                    },
                    {
                        name: 'static',
                        default: null,
                        type: [ 'null', {
                            type: 'record',
                            fields: [
                                { name: 'scene', type: 'string' },
                                { 
                                    name: 'walls', 
                                    type: {
                                        type: 'array',
                                        items: [
                                            {
                                                type: 'array', 
                                                items: [
                                                    {
                                                        type: 'record',
                                                        fields: [
                                                            {
                                                                name: 'pos',
                                                                type: {
                                                                    type: 'record',
                                                                    fields: [
                                                                        { name: 'x', type: 'double' },
                                                                        { name: 'y', type: 'double' }
                                                                    ]
                                                                }
                                                            },
                                                            {
                                                                name: 'points',
                                                                type: {
                                                                    type: 'array',
                                                                    items: [
                                                                        {
                                                                            type: 'record',
                                                                            fields: [
                                                                                { name: 'x', type: 'double' },
                                                                                { name: 'y', type: 'double' }
                                                                            ]
                                                                        }
                                                                    ]
                                                                }
                                                            }
                                                        ]
                                                    }
                                                ]
                                            }
                                        ]
                                    }
                                },
                            ]
                        }]
                    },
                    {
                        name: 'inputs',
                        default: null,
                        type: ['null', {
                            type: 'record',
                            fields: [
                                { name: 'left',  type: 'boolean' },
                                { name: 'right', type: 'boolean' },
                                { name: 'up',    type: 'boolean' },
                                { name: 'down',  type: 'boolean' },
                                { name: 'shift', type: 'boolean' },
                                { name: 'enter', type: 'boolean' },
                            ]
                        }]
                    },
                    { 
                        name: 'ping', 
                        default: null, 
                        type: ['null', {
                            type: 'record',
                            fields: [
                                { name: 'sTimestamp', type: ['long'] },
                                { name: 'cTimestamp', type: ['long', 'null'] },
                                { name: 'clockOffset', type: ['double'] },
                                { name: 'latency', type: ['double'] },
                            ]
                        }]
                    },
                ]
            }
        },
    ]
});

let encode = (data) => {
    if(data.packets.dynamic) {
        var cars = data.packets.dynamic.cars;
        let temp = {};

        for(const [id, car] of Object.entries(cars))
            temp['_'+id] = car;

        data.packets.dynamic.cars = temp;
    }

    const buffer = BUNDLE_TYPE.toBuffer(data);

    if(cars)
        data.packets.dynamic.cars = cars;
    
    return buffer;
}

let decode = (buf) => {
    const buffer = Buffer.from(buf, 'utf8')
    const data = BUNDLE_TYPE.fromBuffer(buffer);

    if(data.packets.dynamic) {
        let cars = data.packets.dynamic.cars;

        for(const [id, car] of Object.entries(cars)) {
            delete cars[id];

            if(car)
                cars[id.substr(1)] = car;
        }
    }

    return data;
}

// let vec = new Vec2D(-1, 1);
// let car = new Car(vec, 60);
// let cars = {
//     '2': car,
//     '4': car,
// };

// let walls = [
//     [[new Vec2D(0, 0), new Vec2D(0, 1), new Vec2D(1, 1), new Vec2D(1, 0)], [new Vec2D(0, 0), new Vec2D(0, -1), new Vec2D(1, -1), new Vec2D(1, 0)]],
//     [[new Vec2D(0, 0), new Vec2D(0, 1), new Vec2D(-1, 1), new Vec2D(-1, 0)], [new Vec2D(0, 0), new Vec2D(0, -1), new Vec2D(-1, -1), new Vec2D(-1, 0)]],
// ];

// let bundle = {
//     tick: 16000000,
//     packets: {
//         id: 4,
//         dynamic: {
//             cars: cars,
//         },
//         static: {
//             scene: 'lobby',
//             walls: walls,
//         },
//     },
// };

// const buff = encode(bundle); 

// console.log(buff);
// console.log(decode(buff).packets.dynamic.cars);
// console.log(bundle.packets.dynamic.cars)

exports.encode = encode;
exports.decode = decode;