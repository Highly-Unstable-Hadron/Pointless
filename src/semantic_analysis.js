const { Fit, Exceptions, TokenTypes, RuleTypes } = require("./helper.js");

const Handler = {};

let globalIdentifiers = new Set();
let signatures = {};
let locals = {};
let constants = {};

function semanticAnalyzer(ast, handler) {
    Handler.handler = handler;

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

    return {
        signatures: signatures,
        locals: locals,
        constants: constants
    }
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
    let resultType = argtypes.pop();

    if (args.length != argtypes.length) {
        let token = args.length > argtypes.length ? args[argtypes.length] : argtypes[args.length];
        Handler.handler.throwError(Exceptions.TypeError, Fit.tokenFailed(token, "Type signature does not match argument length"));
    }
    if (!isWhereDefn)
        return [fnName, args, argtypes, body, wheres, resultType];
    else
        return [fnName, args, argtypes, body, resultType];
}

function* functionDefinition(ast) {
    let [fnName, args, argtypes, body, wheres, resultType] = destructureAssignment(ast, false);

    let stringFnName = String(fnName);
    signatures[stringFnName] = {};
    constants[stringFnName] = {};
    if (globalIdentifiers.has(stringFnName))
        Handler.handler.throwErrorWithoutExit(Exceptions.NameError, Fit.tokenFailed(fnName, "Identifier already used"));
    globalIdentifiers.add(stringFnName);

    let arguments = new Set();
    args.forEach((arg, index) => {
        let stringed_arg = String(arg);
        if (arguments.has(stringed_arg) || stringed_arg == stringFnName)
            Handler.handler.throwErrorWithoutExit(Exceptions.NameError, Fit.tokenFailed(arg, "Identifier already used"));
        arguments.add(stringed_arg);
        signatures[stringFnName][stringed_arg] = argtypes[index];
    });
    signatures[stringFnName][stringFnName] = resultType;

    if (body.isToken) {
        if (body.tokenType == TokenTypes.Identifier) {
            // TODO: finish
            throw "NOT IMPLEMENTED";
        }
        constants[stringFnName][stringFnName] = body;
        return false;
    }

    yield true;  // function name and type have been recorded for referencing elsewhere in the code

    let generators = [];
    let localIdentifiers = new Set(args.map(value => String(value)));
    locals[stringFnName] = {};
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
        if (bodySignature != String(resultType))
            Handler.handler.throwErrorWithoutExit(Exceptions.TypeError, 
                body.fitFailed('', [Math.min(body[0].range[0], body[1].range[0]), // Function and first arg are swapped in infix functions
                                    body.pop().range[1]], 
                    `'${stringFnName}' is supposed to return '${String(resultType)}' but instead returns '${bodySignature}'`, true));
    }

    yield true;
}

function* local_defs(ast, parentName, localIdentifiers) {
    let [fnName, args, argtypes, body, resultType] = destructureAssignment(ast, true);

    let stringFnName = String(fnName);
    if (localIdentifiers.has(stringFnName))
        Handler.handler.throwErrorWithoutExit(Exceptions.NameError, Fit.tokenFailed(fnName, "Identifier already used"));
    localIdentifiers.add(stringFnName);

    let arguments = new Set();
    locals[parentName][stringFnName] = {};
    args.forEach((arg, index) => {
        let stringed_arg = String(arg);
        if (arguments.has(stringed_arg) || stringed_arg == stringFnName)
            Handler.handler.throwErrorWithoutExit(Exceptions.NameError, Fit.tokenFailed(arg, "Identifier already used"));
        arguments.add(stringed_arg);
        locals[parentName][stringFnName][stringed_arg] = argtypes[index];
    });
    locals[parentName][stringFnName][stringFnName] = resultType;

    if (body.isToken) {
        if (body.tokenType == TokenTypes.Identifier) {
            // TODO: finish
            throw "NOT IMPLEMENTED";
        }
        constants[parentName][stringFnName] = body;
        return false;
    }

    yield true;  // function name and type have been recorded for referencing elsewhere in the code

    let bodySignature = verifyBody(body, [parentName, stringFnName]);
    if (bodySignature) {
        if (!bodySignature.isToken)
            bodySignature = String(Object.values(bodySignature).at(-1));
        if (bodySignature != String(resultType))
            Handler.handler.throwErrorWithoutExit(Exceptions.TypeError, 
                body.fitFailed('', [Math.min(body[0].range[0], body[1].range[0]),  // Function and first arg are swapped in infix functions
                                    body.pop().range[1]], 
                    `'${stringFnName}' is supposed to return '${String(resultType)}' but instead returns '${bodySignature}'`, true));
    }

    yield true;
}

function verifyBody(ast, scopes) {
    if (ast.rule_type == RuleTypes.Guard) {
        // TODO: implement
    } else if (ast.rule_type == RuleTypes.FnCall) {
        let [fnName, ...args] = ast;

        let original_scopes = [...scopes];
        for (let i in scopes) {
            if (scopes[i] == String(fnName)) {
                // Not doing this messes up `lookup()` and makes it search too deep, since `signature.function` has attribute `function` too
                scopes = scopes.slice(0, i);
                break;
            }
        }

        let fnSignature = lookup(fnName, scopes);

        if (String(fnName) == 'BVV')
            console.log(fnSignature, scopes, fnName);

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
                let argSignature = lookup(arg, original_scopes);
                if (!argSignature)
                    Handler.handler.throwErrorWithoutExit(Exceptions.NameError, Fit.tokenFailed(arg, "No such identifier found!"));
                else {
                    if (argSignature[String(arg)])
                        argSignature = argSignature[String(arg)];

                    if (String(argSignature) != String(sign[index]))
                        Handler.handler.throwErrorWithoutExit(Exceptions.TypeError, 
                            Fit.tokenFailed(arg, `Expected type '${sign[index]}', instead got argument of type '${argSignature}'`))
                }
            } else {
                let argSignature = verifyBody(arg, original_scopes);
                let nestedFn = String(arg[0]);
                if (argSignature) {
                    if (argSignature[nestedFn])
                        argSignature = argSignature[nestedFn];

                    if (String(argSignature) != String(sign[index])) {
                        Handler.handler.throwErrorWithoutExit(Exceptions.TypeError, 
                            arg.fitFailed('', [Math.min(arg[0].range[0], arg[1].range[0]), // Function and first arg are swapped in infix functions
                                               arg.pop().range[1]],
                                `Expected type '${sign[index]}', instead got argument of type '${argSignature}'`, true));
                        }
                }
            }
            index += 1;
        }
        return fnSignature;
    } else
        throw "Expected Guard or FnCall!!", ast;
}

function lookup(identifier, scopes) {
    let identifier_signature;
    if (scopes.length > 0) {
        if (scopes.length == 2)
            identifier_signature = locals[scopes[0]][scopes[1]][identifier];  // Arguments of parent local function
        if (!identifier_signature)
            identifier_signature = locals[scopes[0]][identifier];  // A local function
        if (!identifier_signature)
            identifier_signature = signatures[scopes[0]][identifier];   // Arguments of parent global function
    }
    if (!identifier_signature)
        identifier_signature = signatures[identifier];  // A global function
    return identifier_signature;
}

module.exports = { semanticAnalyzer };