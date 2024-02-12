const { RuleTypes, TokenTypes } = require("./helper.js");
const { PrimitiveTypes, PrimitiveComposites, PrimitiveEnums, Primitives } = require("./preludeWASM.js");

const globals = {};  // stores StringHandler object and context (semantic analyzer's output)
let exportables = [];  // functions to be exported to JS
const ScopeSeparator = '::';

let haveCompiled = new Map();  // stores which assignments have been compiled (boolean)
let compiledWheres = [];

function wat_indent(that, indent_by) {
    that.wat_indent = indent_by;
    return that;
}

function genTypes(ast_snip) {
    if (typeof ast_snip == "string" || ast_snip.isToken) {
        return PrimitiveTypes.get(String(ast_snip));
    } else {
        let [compositeType, ...subTypes] = ast_snip;
        if (PrimitiveComposites.has(compositeType)) {
            // TODO: implement composite types in semantic analyzer
        }
        throw "COMPOSITE TYPES NOT IMPLEMENTED" + compositeType;
    }
}
function genLiteral(path, ast_snip) {
    switch (ast_snip.tokenType) {
        case TokenTypes.Integer:
            return ['i32.const', ast_snip]
        case TokenTypes.Float:
            return ['f64.const', ast_snip]
        case TokenTypes.String:
            throw 'STRINGS NOT IMPLEMENTED' // TODO: implement
        case TokenTypes.Boolean:
            return ['i32.const', PrimitiveEnums.Boolean[ast_snip]]
        case TokenTypes.Operator:
        case TokenTypes.Identifier:
            let string_ast_snip = String(ast_snip);

            let [type, identifier_path, isArgument] = globals.lookup(string_ast_snip, path); // TODO: higher order functions
            if (!haveCompiled.has(identifier_path.join(ScopeSeparator))) {
                if (identifier_path.length == 2)
                    compiledWheres.push(
                        genFunctionDef(identifier_path, globals.context.localDefinitions[identifier_path[0]][identifier_path[1]])
                    );
                else if (identifier_path.length == 1 && globals.context.definitions[identifier_path[0]]) // don't compile a primitive
                    compiledWheres.push(
                        genFunctionDef(identifier_path, globals.context.definitions[identifier_path[0]])
                    );
                haveCompiled.set(identifier_path.join(ScopeSeparator), true);
            }

            if (type[string_ast_snip]) {
                let parentsArgs = [];  // give local functions access to their parent's args by passing it as args to them
                if (identifier_path.length == 2 && !type.isToken && typeof type != 'string')  // i.e. it is a local fn, not an arg to a global fn
                    parentsArgs = Object.keys(globals.lookup(path[0], [])[0])
                                        .filter(arg => arg != path[0])
                                        .map(arg => ['local.get', '$' + path[0] + ScopeSeparator + arg])
                                        .flat();            
                return [...parentsArgs, 'call', '$'+identifier_path.join(ScopeSeparator)];
                // TODO: implement higher order functions (i.e. check if it needs to be called)
            } else if (type) {
                return ['local.get', '$'+identifier_path.join(ScopeSeparator)];
            } else if (Primitives.has(string_ast_snip)) {
                return [Primitives.get(string_ast_snip).wasmPrimitive];
            }
            throw 'WEIRD OPERATOR/IDENTIFIER '+ast_snip;
        default:
            throw `${ast_snip} IS NOT A LITERAL`
    }
}
function genGuards(path, ast_snip) {
    let output = wat_indent(['if', ...genFnCall(path, ast_snip[0][0]), 
            wat_indent(['then', ...genFnCall(path, ast_snip[0][1])], 3),
        ], 2);
    let remaining_conds = ast_snip.slice(1);
    if (remaining_conds.length != 0)
        output.push(wat_indent(
            ['else', ...genGuards(path, remaining_conds)], 2
        ));
    return [output];
}
function genFnCall(path, ast_snip) {
    if (ast_snip.isToken)
        return genLiteral(path, ast_snip);
    let [fnName, ...args] = ast_snip;
    return [
        ...args.map(argument => genFnCall(path, argument)).flat(),
        ...genLiteral(path, fnName)
    ];
}
function genFunctionDef(path, body) {
    haveCompiled.set(path.join(ScopeSeparator), true);

    let fnName = path.at(-1);
    let resultType = globals.lookup(fnName, path)[0];
    if (fnName in resultType)
        resultType = resultType[fnName];
    path.pop();
    let argumentDict = globals.lookup(fnName, path)[0];  // Dictionary of arguments and their types
    path.push(fnName);

    let argTypes = [];
    let args = [];
    let argPaths = [];
    for (let arg in argumentDict) {
        if (String(arg) != fnName) {
            argPaths.push(path.concat([arg]).join(ScopeSeparator))
            args.push(arg);
            argTypes.push(argumentDict[arg]);

            haveCompiled.set(argPaths.at(-1), true);
        }
    }
    if (path.length == 2) {  // Local functions need to have access to their parent's arguments
        let parentName = path[0];
        let parentFnType = globals.lookup(parentName, [])[0];
        for (let arg in parentFnType) {
            if (String(arg) != parentName) {
                argPaths.push(parentName + ScopeSeparator + arg);
                args.push(arg);
                argTypes.push(parentFnType[arg]);
            }
        }
    }

    let output = wat_indent([
                'func', '$'+path.join(ScopeSeparator),
                ...args.map((arg, index) => ['param', '$'+argPaths[index], genTypes(argTypes[index])]), 
                ['result', genTypes(resultType)],
                ...(body.rule_type == RuleTypes.Guard ? genGuards(path, body) : genFnCall(path, body)),  // TODO: implement constants
            ], 1);
    return output;
}

function constructWasm() {    
    let ast = [];
    for (let fn in globals.context.definitions) {
        if (!haveCompiled.has(fn))
            ast.push(genFunctionDef([fn], globals.context.definitions[fn]));
        // TODO: do only genFnCall(["main"], globals.context.definitions.main, [])
        exportables.push('$'+fn);
    }

    for (let def of compiledWheres) {
        ast.push(def);
    }

    let output = [
        'module',
        ...ast,
        ['export', ...exportables]
    ]
    output.at(-1).wat_newline = true;  // indentation in output
    return [output];
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