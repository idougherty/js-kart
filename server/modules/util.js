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