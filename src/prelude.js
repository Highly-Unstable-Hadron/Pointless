const { fmtAST, Exceptions, RuleTypes, Fit, StringHandler, TokenTypes } = require("./helper.js");

const Primitives = new Map([
    ['Integer', 'i32'],   // two's complement
    ['Float',   'f64'],
    ['Boolean', 'i32'],
])

const Functors = new Map([
    ['List',    []]
])

const Boolean = {
    'True':  '0xFFFFFFFF',
    'False': '0x00000000'
}

const Prelude = new Map([
    // TODO: how?
    // [{signature: [0, 0, 0].fill('Number'), fnName:'+'}, {mapped_f: '.add', generic: true}],
    // ['-', {signature: [0, 0, 0].fill('Number'), mapped_f: '.sub', generic: true}],
    // ['*', {signature: [0, 0, 0].fill('Number'), mapped_f: '.mul', generic: true}],
    // ['/', {signature: [0, 0, 0].fill('Number'), mapped_f:  '.div', generic: true}],
    // ['**', {signature: [0, 0, 0].fill('Number'), mapped_f: '.exp', generic: true}],
    // ['//', {signature: [0, 0, 0].fill('Number'), mapped_f: '.idiv', generic: true}],
]);

const fileHandler = {};  // stores StringHandler object
let exportables = [];  // functions to be exported to JS
let SymbolTable = new Map(Prelude.entries());
let ScopedSymbolTable = new Map();

function genTypes(ast_snip) {
    if (typeof ast_snip == "string" || ast_snip.isToken) {
        if (Primitives.has(String(ast_snip)))
            return Primitives.get(String(ast_snip));
        else
            fileHandler.handler.throwError(Exceptions.TypeError, new Fit('', ast_snip.line_number).fitFailed("", 0, `No such type '${ast_snip}'`, true));
    } else {
        let [functor, ...subTypes] = ast_snip;
        if (Functors.has(functor)) {
            // TODO: implement functors
        }
        console.log(ast_snip)
        throw "NOT IMPLEMENTED";
    }
}
function genLiteral(ast_snip) {
    switch (ast_snip.tokenType) {
        case TokenTypes.Integer:
            return ['i32.const', ast_snip]
        case TokenTypes.Float:
            return ['f64.const', ast_snip]
        case TokenTypes.String:
            throw 'NOT IMPLEMENTED' // TODO: implement
        case TokenTypes.Boolean:
            return ['i32.const', Boolean[ast_snip]]
        case TokenTypes.Identifier:
            return '$' + ast_snip   // TODO: check in symbol table
        default:
            throw `${ast_snip} IS NOT A LITERAL`
    }
}
function genGuards(ast_snip) {
    return []
}
function genFnCall(ast_snip) {
    if (ast_snip.isToken)
        return genLiteral(ast_snip);
    let [fnName, ...args] = ast_snip;
    return [
        ...args.map(genFnCall).flat(),
        'call', '$'+fnName  // TODO: implement WASM's prelude function syntax, type checking
    ]
}
function genWhere(ast_snip) {
    return []
}
function genFunctionDef(ast_snip) {
    let [[fnName, ...args], types, body, ...wheres] = ast_snip;
    let resultType = types.pop();
    if (args.length != types.length) {
        args.fitFailed("", args.length, `Type signature's length does not match that of argument list`, true);
        fileHandler.handler.throwError(Exceptions.TypeError, args);
    }
    // SymbolTable.set({signature: types, fnName: fnName})
    exportables.push(['func', '$'+fnName]);
    
    let output = [
        'func', '$'+fnName, 
        ...args.map((arg, index) => ['param', '$'+arg, genTypes(types[index])]), 
        ['result', genTypes(resultType)],
        ...genWhere(wheres),
        ...(body.rule_type == RuleTypes.Guard ? genGuards(body) : genFnCall(body)),
    ];
    output.wat_indent = true;
    return output
}
function genConstantAssignment(ast_snip) {
    let [[constant], type, body, ...wheres] = ast_snip;
    if (type.length != 1) {
        ast_snip.fitFailed('', 1, `Expected a single type specification for a constant, found ${type}`, true)
        ast_snip.line_number = type.line_number;
        fileHandler.handler.throwError(Exceptions.TypeError, ast_snip);
    }
    [type] = type;
    let wasm_type = genTypes(type);
    return []
}
function genAssignment(ast_snip) {
    if (ast_snip[0].isToken) {
        return genConstantAssignment(ast_snip);
    }
    return genFunctionDef(ast_snip);
}

function constructWasm(ast, handler) {
    fileHandler.handler = handler;
    ast = ast.map(genAssignment);
    let output = [
        'module',
        ...ast,
        ['export', ...exportables]
    ]
    output.at(-1).wat_newline = true;  // indentation in output
    return fmtAST([output]);
}

module.exports = { constructWasm }