const Primitives = {
    i32:     'i32',
    i64:     'i64',
    f32:     'f32',
    f64:     'f64',
    Integer: 'i32',   // two's complement
    Float:   'f64',
    Boolean: 'i32',
    Result:  'v128'
}

const Boolean = {
    'True':  '0xFFFFFFFF',
    'False': '0x00000000'
}

const Result = {

}

const Prelude = new Map([
    ['+', [Primitives.Integer, Primitives.Integer, Primitives.Integer]],
    ['-', [Primitives.Integer, Primitives.Integer, Primitives.Integer]],
    ['*', [Primitives.Integer, Primitives.Integer, Primitives.Integer]],
    ['/', [Primitives.Integer, Primitives.Integer, Primitives.Integer]],
    ['**', [Primitives.Integer, Primitives.Integer, Primitives.Integer]],
    ['//', [Primitives.Integer, Primitives.Integer, Primitives.Integer]],
    ['+', [Primitives.Float, Primitives.Float, Primitives.Float]],
    ['-', [Primitives.Float, Primitives.Float, Primitives.Float]],
    ['*', [Primitives.Float, Primitives.Float, Primitives.Float]],
    ['/', [Primitives.Float, Primitives.Float, Primitives.Float]],
    ['**', [Primitives.Float, Primitives.Float, Primitives.Float]],
    ['//', [Primitives.Float, Primitives.Float, Primitives.Float]],

    ['~', ]
]);
Prelude.set({name: '+', sign:['Integer', 'Integer', 'Integer']})
Prelude.set({})