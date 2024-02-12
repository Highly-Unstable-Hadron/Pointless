const PrimitiveTypes = new Map([
    ['Integer', 'i32'],   // two's complement
    ['Float',   'f64'],
    ['Boolean', 'i32'],
])

const PrimitiveComposites = new Map([
    ['List',    []],  // TODO:
])

const PrimitiveEnums = {
    Boolean: {
        'True':  '0xFFFFFFFF',
        'False': '0x00000000'
    }
}

const Primitives = new Map([
    ['+',  {argTypes: ['Integer', 'Integer'], type: 'Integer', wasmPrimitive: 'i32.add'}],
    ['-',  {argTypes: ['Integer', 'Integer'], type: 'Integer', wasmPrimitive: 'i32.sub'}],
    ['*',  {argTypes: ['Integer', 'Integer'], type: 'Integer', wasmPrimitive: 'i32.mul'}],
    ['/',  {argTypes: ['Integer', 'Integer'], type: 'Integer', wasmPrimitive: 'i32.div'}],
    ['**', {argTypes: ['Integer', 'Integer'], type: 'Integer', wasmPrimitive: 'i32.exp'}],
    ['//', {argTypes: ['Integer', 'Integer'], type: 'Integer', wasmPrimitive: 'i32.idiv'}],
    ['eq', {argTypes: ['Integer', 'Integer'], type: 'Boolean', wasmPrimitive: 'i32.eq'}]
]);

module.exports = { PrimitiveTypes, PrimitiveComposites, PrimitiveEnums, Primitives }