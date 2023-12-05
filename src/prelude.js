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

const fileHandler = {};  // stores StringHandler object
let exportables = [];  // functions to be exported to JS
let SymbolTable = new Map([
    ['+', {argTypes: ['Integer', 'Integer'], type: 'Integer', wasmPrimitive: 'i32.add'}],
    ['-', {argTypes: ['Integer', 'Integer'], type: 'Integer', wasmPrimitive: 'i32.sub'}],
    ['*', {argTypes: ['Integer', 'Integer'], type: 'Integer', wasmPrimitive: 'i32.mul'}],
    ['/', {argTypes: ['Integer', 'Integer'], type: 'Integer', wasmPrimitive:  'i32.div'}],
    ['**', {argTypes: ['Integer', 'Integer'], type: 'Integer', wasmPrimitive: 'i32.exp'}],
    ['//', {argTypes: ['Integer', 'Integer'], type: 'Integer', wasmPrimitive: 'i32.idiv'}],
    ['eq', {argTypes: ['Integer', 'Integer'], type: 'Integer', wasmPrimitive: 'i32.eq'}]
]);
let current_scope = null;

function genTypes(ast_snip) {
    if (typeof ast_snip == "string" || ast_snip.isToken) {
        if (Primitives.has(String(ast_snip)))
            return Primitives.get(String(ast_snip));
        else
            fileHandler.handler.throwError(Exceptions.TypeError,
                Fit.tokenFailed(ast_snip, `No such type '${ast_snip}'`)
            );
    } else {
        let [functor, ...subTypes] = ast_snip;
        if (Functors.has(functor)) {
            // TODO: implement functors
        }
        console.log(ast_snip)
        throw "NOT IMPLEMENTED";
    }
}
function genLiteral(ast_snip, call_fn = false) {
    switch (ast_snip.tokenType) {
        case TokenTypes.Integer:
            return ['i32.const', ast_snip]
        case TokenTypes.Float:
            return ['f64.const', ast_snip]
        case TokenTypes.String:
            throw 'NOT IMPLEMENTED' // TODO: implement
        case TokenTypes.Boolean:
            return ['i32.const', Boolean[ast_snip]]
        case TokenTypes.Operator:
        case TokenTypes.Identifier:
            let pathExists = false;
            let scopes = current_scope.split('::'), path;
            for (let i = 0; (scopes.length > 1 && i < scopes.length) || (i < 2); i++) {
                path = scopes.slice(0, i).join('::')
                if (path)
                    path += '::'
                path += ast_snip
                if (SymbolTable.has(path)) {
                    pathExists = true;
                    break;
                }
            }
            if (!pathExists) {
                fileHandler.handler.throwError(Exceptions.NameError,
                    Fit.tokenFailed(ast_snip, `No such identifier '${ast_snip}'`)
                );
            }
            let wasmPrimitive = SymbolTable.get(path).wasmPrimitive;
            if (wasmPrimitive) {
                return [wasmPrimitive]
            }
            return ['call', '$' + path]
        default:
            throw `${ast_snip} IS NOT A LITERAL`
    }
}
function genGuards(ast_snip) {
    if (ast_snip.length == 0)
        return [];
    return [['if', ...genFnCall(ast_snip[0][0]), 
                ['then', ...genFnCall(ast_snip[0][1])], 
                ['else', ...genGuards(ast_snip.slice(1,))]].map((value) => {
                    if (typeof value != 'string')
                        value.wat_indent = true;
                    return value;
                })]
}
function genFnCall(ast_snip) {
    if (ast_snip.isToken)
        return genLiteral(ast_snip);
    let [fnName, ...args] = ast_snip;
    return [
        ...args.map(genFnCall).flat(),
        ...genLiteral(fnName, true)  // TODO: implement type checking
    ]
}
function genWhere(ast_snip) {
    return ast_snip.map((a) => genFunctionDef(a));
}
function genFunctionDef(ast_snip) {
    let [header, types, body, ...wheres] = ast_snip, fnName, args;
    if (header.isToken)
        fnName = header, args=new Fit('', header.line_number);
    else
        [fnName, ...args] = header;
    let resultType = types.pop();
    if (!current_scope) {
        exportables.push(['func', '$'+fnName]);
    } else {
        fnName = current_scope + '::' + fnName;
    }
    let old = current_scope;
    current_scope = fnName;
    SymbolTable.set(String(fnName), {argTypes: types, type: resultType});
    args.forEach((arg, index) => SymbolTable.set(fnName + '::' + arg, {type: types[index]}))
    if (!old)
        compiled_wheres = genWhere(wheres);
    else
        compiled_wheres = [];
    output = [
                'func', '$'+fnName,
                ...args.map((arg, index) => ['param', '$'+fnName+'::'+arg, genTypes(types[index])]), 
                ['result', genTypes(resultType)],
                ...(body.rule_type == RuleTypes.Guard ? genGuards(body) : genFnCall(body)),
            ];
    output.wat_indent = true;
    current_scope = old;
    if (compiled_wheres.length == 0)
        return output
    else {
        output = [...compiled_wheres, output]
        output.unwrap = true;
        return output
    }
}

function constructWasm(ast, handler) {
    fileHandler.handler = handler;
    ast = ast.map((a) => genFunctionDef(a));
    let unwrapped_ast = [];
    for (defn of ast) {
        if (defn.unwrap) {
            for (sub_defn of defn) {
                unwrapped_ast.push(sub_defn)
            }
        } else {
            unwrapped_ast.push(defn)
        }
    }
    let output = [
        'module',
        ...unwrapped_ast,
        ['export', ...exportables]
    ]
    output.at(-1).wat_newline = true;  // indentation in output
    return fmtAST([output]);
}

module.exports = { constructWasm }