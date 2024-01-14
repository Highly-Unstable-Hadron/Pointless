const { fmtAST, Exceptions, RuleTypes, Fit, StringHandler, TokenTypes } = require("./helper.js");

const PrimitiveTypes = new Map([
    ['Integer', 'i32'],   // two's complement
    ['Float',   'f64'],
    ['Boolean', 'i32'],
])

const PrimitiveFunctors = new Map([
    ['List',    []]
])

const Boolean = {
    'True':  '0xFFFFFFFF',
    'False': '0x00000000'
}

const globals = {};  // stores StringHandler object and context (semantic analyzer's output)
let exportables = [];  // functions to be exported to JS
const ScopeSeparator = '::';

const Primitives = new Map([
    ['+',  {argTypes: ['Integer', 'Integer'], type: 'Integer', wasmPrimitive: 'i32.add'}],
    ['-',  {argTypes: ['Integer', 'Integer'], type: 'Integer', wasmPrimitive: 'i32.sub'}],
    ['*',  {argTypes: ['Integer', 'Integer'], type: 'Integer', wasmPrimitive: 'i32.mul'}],
    ['/',  {argTypes: ['Integer', 'Integer'], type: 'Integer', wasmPrimitive: 'i32.div'}],
    ['**', {argTypes: ['Integer', 'Integer'], type: 'Integer', wasmPrimitive: 'i32.exp'}],
    ['//', {argTypes: ['Integer', 'Integer'], type: 'Integer', wasmPrimitive: 'i32.idiv'}],
    ['eq', {argTypes: ['Integer', 'Integer'], type: 'Integer', wasmPrimitive: 'i32.eq'}]
]);
let cursor_scope = [];

function genTypes(ast_snip) {
    return "TYPE";  // TODO: fix bug where ast_snip is null
    if (typeof ast_snip == "string" || ast_snip.isToken) {
        if (PrimitiveTypes.has(String(ast_snip)))
            return PrimitiveTypes.get(String(ast_snip));
        else
            globals.handler.throwError(Exceptions.TypeError,
                Fit.tokenFailed(ast_snip, `No such type '${ast_snip}'`)
            );
    } else {
        let [functor, ...subTypes] = ast_snip;
        if (PrimitiveFunctors.has(functor)) {
            // TODO: implement functors
        }
        throw "FUNCTORS NOT IMPLEMENTED" + functor;
    }
}
function genLiteral(ast_snip) {
    switch (ast_snip.tokenType) {
        case TokenTypes.Integer:
            return ['i32.const', ast_snip]
        case TokenTypes.Float:
            return ['f64.const', ast_snip]
        case TokenTypes.String:
            throw 'STRINGS NOT IMPLEMENTED' // TODO: implement
        case TokenTypes.Boolean:
            return ['i32.const', Boolean[ast_snip]]
        case TokenTypes.Operator:
        case TokenTypes.Identifier:
            // TODO: move checking for primitives to end (lowest precedence) and implement primitives in semantic analyzer
            let primitive = Primitives.get(String(ast_snip));
            if (primitive)
                return [primitive.wasmPrimitive];

            let [type, path, isArgument] = globals.lookup(ast_snip, cursor_scope);

            if (type && !type.isToken && typeof type != 'string' && type.length > 1) { // if type is an array
                return ['call', '$'+path.join(ScopeSeparator)];
                // TODO: implement higher order functions (i.e. check if it needs to be called)
            } else if (type) {
                if (isArgument)
                    return ['args.get', '$'+path.join(ScopeSeparator)];
                return ['locals.get', '$'+path.join(ScopeSeparator)];
            }
            throw 'WEIRD OPERATOR/IDENTIFIER '+ast_snip;
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
        ...genLiteral(fnName)
    ]
}
function genWhere(ast_snip) {
    return ast_snip.map((a) => genFunctionDef(a));
}
function genFunctionDef(ast_snip) {
    let [header, types, body, ...wheres] = ast_snip, fnName, args;
    if (header.isToken)
        fnName = header, args = new Fit('', header.line_number);
    else
        [fnName, ...args] = header;
    let resultType = types.pop();
    if (!cursor_scope) {
        exportables.push(['func', '$'+fnName]);
    } else {
        fnName = cursor_scope.concat([fnName]).join(ScopeSeparator);
    }
    let old = [...cursor_scope];
    cursor_scope.push(fnName);
    if (!old)
        compiled_wheres = genWhere(wheres);
    else
        compiled_wheres = [];
    output = [
                'func', '$'+fnName,
                ...args.map((arg, index) => ['param', '$'+fnName+ScopeSeparator+arg, genTypes(types[index])]), 
                ['result', genTypes(resultType)],
                ...(body.rule_type == RuleTypes.Guard ? genGuards(body) : genFnCall(body)),  // TODO: implement constants
            ];
    output.wat_indent = true;
    cursor_scope = old;
    if (compiled_wheres.length == 0)
        return output
    else {
        output = [...compiled_wheres, output]
        output.unwrap = true;
        return output
    }
}

function constructWasm(ast) {    
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

function codeGenSetGlobals(context, lookup, handler){
    globals.handler = handler;
    globals.lookup = lookup.bind({
        locals:     context.locals,
        signatures: context.signatures
    });
    globals.context = context;
}

module.exports = { constructWasm, codeGenSetGlobals }