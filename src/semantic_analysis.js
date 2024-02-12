const { Token, Fit, Exceptions, TokenTypes, RuleTypes } = require("./helper.js");
const { PrimitiveTypes, PrimitiveComposites, PrimitiveEnums, Primitives } = require("./preludeWASM.js");

const Handler = {};

let globalIdentifiers = new Set();

let definitions = {};       // References to the global fn's AST
let signatures = {};        // Signatures of globals
let localDefinitions = {};  // References to local fn's AST
let localSignatures = {};   // Signatures of locals
const semanticGraph = {
    referencing: {          // Semantic graph's out-edges
        locals: {},
        globals: {}
    },
    referenced_in: {        // Semantic graph's in-edges
        local_args: {},
        locals: {},
        globals: {}
    },
    fetchFromPath: function (path) {
        let [first, second, third] = path;
        if (second === undefined)
            return [this.referenced_in.globals[first], this.referencing.globals[first]];
        else if (third === undefined)
            return [this.referenced_in.locals[first][second], this.referencing.locals[first][second]];
        return [this.referenced_in.local_args[first][second][third], undefined];
    }
}

function setStringHandler(handler) {
    Handler.handler = handler;
}

function semanticAnalyzer(ast) {
    let generators = [];
    ast.forEach(definition => {
        let yielded_exec = functionDefinition(definition);
        if (yielded_exec.next().value)
            generators.push(yielded_exec);
    });
    // Using generators like this allows for referencing before declaration
    generators.forEach(generator => {
        generator.next()
    });

    if (Handler.handler.errorOccurred)
        process.exit(1);

    // findRecursiveFunctions(findSinkSCC());
    // TODO: post-processing
    return {
        definitions:        definitions,
        signatures:         signatures,
        localDefinitions:   localDefinitions,
        locals:             localSignatures,
        semanticGraph:      semanticGraph
    }
}

let SCCs = [];

function findRecursiveFunctions(path_to_node) {
    // Using Kosaraju's algorithm on semanticGraph to find Strongly Connected Components (i.e. recursive functions)
    // This produces a DAG of SCCs, where each node is a single function in the code generator's output (only in an ideal world ofc)
    // This allows us to treat functions which don't reference themselves as macros, and ones which do as loops (hopefully)
    let [references, SCC] = semanticGraph.fetchFromPath(path_to_node);
    SCCs.push(SCC);
    let node;
    for (node of references) {
        let index = semanticGraph.fetchFromPath(node)[1].findIndex(path => path == path_to_node);
        // TODO: remove `index`th entry in semanticGraph
        // TODO: repeat for all other elements in SCC
    }
    findRecursiveFunctions(node);
}

function findSinkSCC() {  // TODO: fix bug where findSinkSCC returns undefined
    let node;
    let visited = new Set();

    for (node in semanticGraph.referenced_in.globals)  // fetch a random node
        break;

    node = [node];
    let adjacent_nodes;
    
    do {
        visited.add(node);
        adjacent_nodes = semanticGraph.fetchFromPath(node)[0];
        if (!adjacent_nodes)
            break;

        let i = 0;
        do {
            node = adjacent_nodes[i++];
        } while (visited.has(node) && i <= adjacent_nodes.length);

    } while (adjacent_nodes.length && !visited.has(node));
    return node;
}

function destructureAssignment(ast, isWhereDefn) {
    let header, argtypes, body, wheres, fnName, args;
    if (!isWhereDefn)
        [header, argtypes, body, ...wheres] = ast;
    else
        [header, argtypes, body] = ast;

    if (header.isToken)
        fnName = header, args=new Fit('', header.line_number);
    else
        [fnName, ...args] = header;

    argtypes.map(type => {
        if (!PrimitiveTypes.has(String(type))) {
            let fit;
            if (type.isToken)
                fit = Fit.tokenFailed(type, `No such type '${type}'`);
            else  // TODO: implement errors for composite types
                fit = type.fitFailed('', [type[0].range[0], type.at(-1).range[1]], `No such type '${type}'`, true);
            Handler.handler.throwErrorWithoutExit(Exceptions.TypeError, fit);
        }
    });

    let resultType = argtypes.at(-1);   // Stupppid call-by-reference. Doing argtypes.pop() modifies original AST
    let types = argtypes.slice(0, -1);

    if (args.length != types.length) {
        let token = args.length > types.length ? args[types.length] : types[args.length];
        Handler.handler.throwError(Exceptions.TypeError, Fit.tokenFailed(token, "Type signature does not match argument length"));
    }
    if (!isWhereDefn)
        return [fnName, args, types, body, wheres, resultType];
    else
        return [fnName, args, types, body, resultType];
}

function* functionDefinition(ast) {
    let [fnName, args, argtypes, body, wheres, resultType] = destructureAssignment(ast, false);

    let stringFnName = String(fnName);
    signatures[stringFnName] = {};
    definitions[stringFnName] = body;
    localDefinitions[stringFnName] = {};
    semanticGraph.referencing.globals[stringFnName] = [];
    semanticGraph.referenced_in.globals[stringFnName] = [];
    semanticGraph.referencing.locals[stringFnName] = {};
    semanticGraph.referenced_in.locals[stringFnName] = {};
    semanticGraph.referenced_in.local_args[stringFnName] = {}; 
    if (globalIdentifiers.has(stringFnName))
        Handler.handler.throwErrorWithoutExit(Exceptions.NameError, Fit.tokenFailed(fnName, "Identifier already used"));
    globalIdentifiers.add(stringFnName);

    let arguments = new Set();
    args.forEach((arg, index) => {
        let stringed_arg = String(arg);
        semanticGraph.referencing.locals[stringFnName][stringed_arg] = [];
        semanticGraph.referenced_in.locals[stringFnName][stringed_arg] = [];
        if (arguments.has(stringed_arg) || stringed_arg == stringFnName)
            Handler.handler.throwErrorWithoutExit(Exceptions.NameError, Fit.tokenFailed(arg, "Identifier already used"));
        arguments.add(stringed_arg);
        signatures[stringFnName][stringed_arg] = argtypes[index];
    });
    signatures[stringFnName][stringFnName] = resultType;

    yield true;  // function name and type have been recorded for referencing elsewhere in the code

    let generators = [];
    // can't have the function name or arguments shadowed by locals
    let localIdentifiers = new Set(args.map(value => String(value)));
    localIdentifiers.add(stringFnName);

    localSignatures[stringFnName] = {};
    wheres.forEach(where_stmt => {
        let yielded = local_defs(where_stmt, stringFnName, localIdentifiers);
        if (yielded.next().value) 
            generators.push(yielded);
    });
    generators.forEach(generator => generator.next());

    let bodySignature = verifyBody(body, [stringFnName]);  // TODO: fix bug
    if (bodySignature) {
        if (!bodySignature.isToken)
            bodySignature = String(Object.values(bodySignature).at(-1));
        if (String(bodySignature) != String(resultType)) {
            let fit;
            if (body.isToken)
                fit = Fit.tokenFailed(body, `'${stringFnName}' is supposed to return '${String(resultType)}' but instead returns '${bodySignature}'`);
            else {
                let startRange = Math.min(body[0].range[0], body[1].range[0]);  // Function and first arg are swapped in infix functions
                let lastToken = body.at(-1);
                while (!lastToken.isToken)
                    lastToken = lastToken.at(-1);
                fit = body.fitFailed('', [startRange, lastToken.range[1]], 
                                     `'${stringFnName}' is supposed to return '${String(resultType)}' but instead returns '${bodySignature}'`, 
                                     true);
            }
            Handler.handler.throwErrorWithoutExit(Exceptions.TypeError, fit);
        }
    }

    yield true;
}

function* local_defs(ast, parentName, localIdentifiers) {
    let [fnName, args, argtypes, body, resultType] = destructureAssignment(ast, true);

    let stringFnName = String(fnName);
    localDefinitions[parentName][stringFnName] = body;
    semanticGraph.referencing.locals[parentName][stringFnName] = [];
    semanticGraph.referenced_in.locals[parentName][stringFnName] = [];
    semanticGraph.referenced_in.local_args[parentName][stringFnName] = {};
    if (localIdentifiers.has(stringFnName))
        Handler.handler.throwErrorWithoutExit(Exceptions.NameError, Fit.tokenFailed(fnName, "Identifier already used"));
    localIdentifiers.add(stringFnName);

    let arguments = new Set();
    localSignatures[parentName][stringFnName] = {};
    args.forEach((arg, index) => {
        let stringed_arg = String(arg);
        semanticGraph.referenced_in.local_args[parentName][stringFnName][stringed_arg] = [];
        if (arguments.has(stringed_arg) || stringed_arg == stringFnName)
            Handler.handler.throwErrorWithoutExit(Exceptions.NameError, Fit.tokenFailed(arg, "Identifier already used"));
        arguments.add(stringed_arg);
        localSignatures[parentName][stringFnName][stringed_arg] = argtypes[index];
    });
    localSignatures[parentName][stringFnName][stringFnName] = resultType;

    yield true;  // function name and type have been recorded for referencing elsewhere in the code

    let bodySignature = verifyBody(body, [parentName, stringFnName]);
    if (bodySignature) {
        if (!bodySignature.isToken)
            bodySignature = String(Object.values(bodySignature).at(-1));
        if (String(bodySignature) != String(resultType)) {
            let fit;
            if (body.isToken)
                fit = Fit.tokenFailed(body, `'${stringFnName}' is supposed to return '${String(resultType)}' but instead returns '${bodySignature}'`);
            else {
                let startRange = Math.min(body[0].range[0], body[1].range[0]);  // Function and first arg are swapped in infix functions
                let lastToken = body.at(-1);
                while (!lastToken.isToken)
                    lastToken = lastToken.at(-1);
                fit = body.fitFailed('', [startRange, lastToken.range[1]], 
                                        `'${stringFnName}' is supposed to return '${String(resultType)}' but instead returns '${bodySignature}'`, 
                                        true);
            }
            Handler.handler.throwErrorWithoutExit(Exceptions.TypeError, fit);
        }
    }

    yield true;
}

function verifyBody(ast, scopes) {
    let [_, referencing] = semanticGraph.fetchFromPath(scopes);
    if (ast.rule_type == RuleTypes.Guard) {
        let oldSignature;
        for (let case_ of ast) {
            let [cond, body] = case_;
            let condSignature = verifyBody(cond, scopes);

            if (condSignature && !condSignature.isToken)
                condSignature = String(Object.values(condSignature).at(-1));
            if (condSignature && String(condSignature) != "Boolean") {
                let fit;
                if (cond.isToken)
                    fit = Fit.tokenFailed(cond, `Condition is supposed to return type 'Boolean', instead returns '${condSignature}'`);
                else {
                    let startRange = Math.min(cond[0].range[0], cond[1].range[0]);  // Function and first arg are swapped in infix functions
                    let lastToken = cond.at(-1);
                    while (!lastToken.isToken)
                        lastToken = lastToken.at(-1);
                    fit = cond.fitFailed('', [startRange, lastToken.range[1]], 
                                        `Condition is supposed to return type 'Boolean', instead returns '${condSignature}'`, true);
                }
                Handler.handler.throwErrorWithoutExit(Exceptions.TypeError, fit);
            }

            let bodySignature = verifyBody(body, scopes);
            if (!bodySignature.isToken)
                bodySignature = Object.values(bodySignature).at(-1);
            if (oldSignature && String(oldSignature) != String(bodySignature)) {
                let fit;

                if (body.isToken)
                    fit = Fit.tokenFailed(body, `Expected all arms to have the same signature, found ${bodySignature}`);
                else {
                    let startRange = Math.min(body[0].range[0], body[1].range[0]);  // Function and first arg are swapped in infix functions
                    let lastToken = body.at(-1);
                    while (!lastToken.isToken)
                        lastToken = lastToken.at(-1);
                    fit = body.fitFailed('', [startRange, lastToken.range[1]], 
                                        `Expected all arms to have the same signature, found ${bodySignature}`, true);
                }
                Handler.handler.throwErrorWithoutExit(Exceptions.TypeError, fit);
            }
            oldSignature = bodySignature;
        }
        return oldSignature;
    } else if (ast.rule_type == RuleTypes.FnCall) {
        let [fnName, ...args] = ast;
        let [fnSignature, path, __] = lookup(fnName, scopes);
        semanticGraph.fetchFromPath(path)[0].push(scopes);

        if (!fnSignature)
            return Handler.handler.throwErrorWithoutExit(Exceptions.NameError,
                Fit.tokenFailed(fnName, "No such function found in source"));

        if (!fnSignature)
            return Handler.handler.throwErrorWithoutExit(Exceptions.NameError,
                Fit.tokenFailed(fnName, "No such function found in source"));

        let sign = Object.values(fnSignature);
        if (args.length > sign.length + 1)
            return Handler.handler.throwErrorWithoutExit(Exceptions.TypeError, 
                Fit.tokenFailed(fnName, 
                    `Too many arguments provided for function of signature '${sign.join(' => ')}'`));
        
        let index = 0
        for (let arg of args) {
            if (arg.isToken) {  // TODO: implement hardcoded constants
                let argSignature;
                if (arg.tokenType == TokenTypes.Identifier) {
                    let argPath;
                    [argSignature, argPath, _] = lookup(String(arg), scopes);
                    referencing.push(argPath);
                    semanticGraph.fetchFromPath(argPath)[0].push(scopes);
                } else
                    argSignature = verifyBody(arg, scopes);

                if (!argSignature) {
                    Handler.handler.throwErrorWithoutExit(Exceptions.NameError, Fit.tokenFailed(arg, "No such identifier found!"));
                } else {
                    if (!argSignature.isToken && argSignature[String(arg)])
                        argSignature = argSignature[String(arg)];

                    if (String(argSignature) != String(sign[index]))
                        Handler.handler.throwErrorWithoutExit(Exceptions.TypeError, 
                            Fit.tokenFailed(arg, `Expected type '${sign[index]}', instead got argument of type '${argSignature}'`))
                }
            } else {
                let argSignature = verifyBody(arg, scopes);
                let nestedFn = String(arg[0]);
                if (argSignature) {
                    if (argSignature[nestedFn])
                        argSignature = argSignature[nestedFn];

                    if (String(argSignature) != String(sign[index])) {
                        let startRange = Math.min(arg[0].range[0], arg[1].range[0]);  // Function and first arg are swapped in infix functions
                        let lastToken = arg.at(-1);
                        while (!lastToken.isToken)
                            lastToken = lastToken.at(-1);
                        Handler.handler.throwErrorWithoutExit(Exceptions.TypeError, 
                            arg.fitFailed('', [startRange, lastToken.range[1]],
                                `Expected type '${sign[index]}', instead got argument of type '${argSignature}'`, true));
                        }
                }
            }
            index += 1;
        }
        return fnSignature;
    } else if (ast.isToken) {
        // TODO: fix bug
        switch (ast.tokenType) {
            case TokenTypes.Identifier:
                let [signature, path, _] = lookup(String(ast), scopes);
                referencing.push(path);
                semanticGraph.fetchFromPath(path)[0].push(scopes);
                return signature;
            case TokenTypes.Boolean:
                return new Token("Boolean");
            case TokenTypes.Integer:
                return new Token("Integer");
            case TokenTypes.String:
                return new Token("String");
            case TokenTypes.Float:
                return new Token("Float");
            default:
                throw `WEIRD TOKENTYPE ${ast.tokenType}`;
        }
    } else
        throw "Expected Guard or FnCall!!", ast;
}

function lookup(identifier, scopes) {
    let identifier_signature, path, isArgument = false;
    for (let i in scopes) {
        if (scopes[i] == identifier) {
            // Since `signature.function` has attribute `function` too (storing returntype),
            // while we want to return the type of the entire function, including that of its arguments
            scopes = scopes.slice(0, i);
            break;
        }
    }
    if (scopes.length > 0) {
        if (scopes.length == 2)
            identifier_signature = localSignatures[scopes[0]][scopes[1]][identifier], 
            path = [...scopes, identifier],
            isArgument = identifier_signature ? true : false; // Arguments of parent local function
        if (!identifier_signature)
            identifier_signature = localSignatures[scopes[0]][identifier],
            path = [scopes[0], identifier],
            isArgument = false;  // A local function/value
        if (!identifier_signature)
            identifier_signature = signatures[scopes[0]][identifier],
            path = [scopes[0], identifier],
            isArgument = identifier_signature ? true : false;  // Arguments of parent global function
    }
    if (!identifier_signature)
        identifier_signature = signatures[identifier],
        path = [identifier],
        isArgument = false;  // A global function/value

    if (path.length == 2 && path[0] == path[1])  // the type of the function itself is given in such an entry
        path.pop(), isArgument = false;

    return [identifier_signature, path, isArgument];
}

module.exports = { semanticAnalyzer, lookup, setStringHandler };