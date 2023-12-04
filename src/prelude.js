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
            let isChild = SymbolTable.has(current_scope + '::' + ast_snip);  // TODO: search better
            if (!SymbolTable.has(ast_snip) && !isChild) {
                // fileHandler.handler.throwError(Exceptions.NameError, 
                //     new Fit('', ast_snip.line_number).fitFailed('', 0, `No such identifier '${ast_snip}'`, true)
                // );
            }
            if (isChild)
                return '$' + current_scope + '::' + ast_snip;
            return '$' + ast_snip
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
    SymbolTable.set(fnName, {argTypes: types, type: resultType});
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