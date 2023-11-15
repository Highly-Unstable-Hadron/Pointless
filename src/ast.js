// TODO: OBSOLETE FILE, delete

const { Symbol, TokenTypes } = require("./helper.js");

let divider_index = 0;

function build_ast(tokens) {
    let grandparent = new Symbol('', 'body', null, null)
    grandparent.construct_CSS_selector()
    let stuffed_obj = tokens.reduce((acc, token) => {
        let [ parent, line_no, z_index, done_with_first, index, accumulator ] = acc;
        index += 1;
        if (done_with_first)
            return acc;
        let tokenType = token.tokenType;
        token = String(token)  // cast from Token back to String
        switch (tokenType) {
            case TokenTypes.Selector.TagName:
                accumulator.push(new Symbol('', token, null, parent, line_no, z_index));
                break;
            case TokenTypes.Selector.Id:
                if (accumulator.at(-1) && accumulator.at(-1).htmlId === '' && accumulator.at(-1).htmlTag != '')
                    accumulator.at(-1).htmlId = token;
                else
                    accumulator.push(new Symbol(token, '', null, parent, line_no, z_index))
                break;
            case TokenTypes.Height:
                if (accumulator.at(-1) && (!accumulator.at(-1).dimensions || !accumulator.at(-1).dimensions.height))   // accumulator.at(-1).dimensions is either null or undefined
                    accumulator.at(-1).dimensions = {...accumulator.at(-1).dimensions, height: null} 
                else
                    accumulator.push(new Symbol('', '', dimensions = {height: null}, parent, line_no, z_index))
                break;
            case TokenTypes.Width:
                if (accumulator.at(-1) && (!accumulator.at(-1).dimensions || !accumulator.at(-1).dimensions.width))   // accumulator.at(-1).dimensions is either null or undefined
                    accumulator.at(-1).dimensions = {...accumulator.at(-1).dimensions, width: null} 
                else
                    accumulator.push(new Symbol('', '', dimensions = {width: null}, parent, line_no, z_index))
                break;
            case TokenTypes.NumericalValue:
                key = Object.entries(accumulator.at(-1).dimensions).find((entry, _, _1) => entry[1] === null)[0]
                accumulator.at(-1).dimensions[key] = token;
                break;
            case TokenTypes.Overlay:
                z_index += 1
                break;
            case TokenTypes.Newline:
                line_no += 1
                z_index = 0
                break;
            case TokenTypes.WindowOpen:
                if (accumulator.length > 0)
                    parent = accumulator.pop();
                parent.construct_CSS_selector()
                break;
            case TokenTypes.Divider:
                done_with_first = true;
                divider_index = index;
                break;
            default:
                break;
        }
        return [ parent, line_no, z_index, done_with_first, index, accumulator ];
    }, [ grandparent, 1, 0, false, 0, []])
    let ast = stuffed_obj.at(-1)
    ast.forEach((el) => el.construct_CSS_selector())
    // FORMAT: grouped_ast = {parent: {line#1: [selectors...], line#2: [selectors...], ...}, ...}
    grouped_ast = ast.reduce((accumulator, symbol)=>{
            accumulator[symbol.parent.cssSelector] =
                accumulator[symbol.parent.cssSelector] === undefined ? {} : accumulator[symbol.parent.cssSelector];
            accumulator[symbol.parent.cssSelector][symbol.line_number] =
                accumulator[symbol.parent.cssSelector][symbol.line_number] === undefined ? 
                [symbol] : [...accumulator[symbol.parent.cssSelector][symbol.line_number], symbol];
            return accumulator;
    }, {})
    if (divider_index == 0)
        divider_index += stuffed_obj.at(-2)
    language_ast(tokens)
    return grouped_ast
}

const AbstractionType = {
    TypeDefinition: 0,
    Assignment:     1,
    Guard:          2,
    Where:          3,
    Expression:     4,
    CompoundType:   5
}

function language_ast(tokens_) {
    let tokens = tokens_.slice(divider_index)
    let SymbolTable = new Map();
    // console.log(tokens.slice(70))
    let ast = tokens.reduce((acc, token) => {
        let [ current_line_indent, prev_line_indent, current_abstraction, guards, nested_where, index, nested_curr_abstr, accumulator ] = acc;
        let tokenType = token.tokenType;
        index += 1;
        token = String(token);   // Casting back to String from type Token
        // TODO: newline tolerant in some places
        switch (tokenType) {
            case TokenTypes.Integer:
            case TokenTypes.Float:
            case TokenTypes.String:
            case TokenTypes.Boolean:
            case TokenTypes.Identifier:
                if (current_line_indent < prev_line_indent && guards.length > 0) {
                    let i = 0;
                    let a = accumulator;
                    while (i < prev_line_indent) {
                        a = a.at(-1)
                        i += 1
                    }
                    a.push(guards)
                    guards = []
                    nested_where = false;
                }
                if (nested_curr_abstr) {
                    current_abstraction.at(-1).push(token)
                    nested_curr_abstr = false
                } else
                    current_abstraction.push(token)
                break;
            case TokenTypes.ParensOpen:
                current_abstraction.push(token)
                break;
            case TokenTypes.ParensClose:
                for (i in current_abstraction) {
                    let l = current_abstraction.length;
                    if (current_abstraction[l - i] === '(') {  // Search from back
                        expr = [current_abstraction[l - i - 1]].concat(current_abstraction.slice(l - i + 1,))
                        expr.type = AbstractionType.Expression;
                        current_abstraction = current_abstraction.slice(0, l - i - 1)
                        current_abstraction.push(expr);
                        if (current_abstraction.length == 1) {
                            current_abstraction = current_abstraction[0]
                        }
                        current_abstraction.type = AbstractionType.Expression;
                        break;
                    }
                }
                break;
            case TokenTypes.Operator: // TODO: implement precedence and right/left associativity
                expr = [token, current_abstraction.pop()];
                expr.type = AbstractionType.Expression;
                current_abstraction.push(expr)
                if (current_abstraction.length == 1)
                    current_abstraction = current_abstraction[0]
                else
                    nested_curr_abstr = true;
                break;
            case TokenTypes.Newline:
                prev_line_indent = current_line_indent;
                current_line_indent = 0;
                if (current_abstraction.type === AbstractionType.Expression && current_abstraction.length > 0) {
                    if (guards.type === AbstractionType.Guard) {
                        guards.push(current_abstraction)
                        current_abstraction = []
                        current_abstraction.type = AbstractionType.Expression
                        break;
                    } else if (nested_where) {
                        accumulator.at(-1).at(-1).push(current_abstraction);
                        nested_where = false;
                    } else
                        accumulator.at(-1).push(current_abstraction)
                    current_abstraction = []
                } 
                break;
            case TokenTypes.Assignment:
                guards = []  // reset
                let cnt = 1
                var type_def = []
                for (token of current_abstraction.reverse()) {
                    if (typeof token != "string" && token.type == AbstractionType.TypeDefinition) {
                        type_def.push(token[0])
                        break;
                    }
                    type_def.push(token);
                    cnt += 1;
                }
                type_def = (type_def.length == 1 ? type_def[0] : type_def.reverse())
                current_abstraction = current_abstraction.reverse().slice(0, -cnt)
                current_abstraction.type = AbstractionType.Assignment;
                let parent = '';
                if (nested_where) {
                    current_abstraction.type = AbstractionType.Where
                    accumulator.at(-1).push(current_abstraction)
                    parent = accumulator.at(-1)[0] + '.'
                } else
                    accumulator.push(current_abstraction)
                if (SymbolTable.has({name: parent + current_abstraction[0], signature:type_def}))
                    throw "...";  // TODO:
                SymbolTable.set({name: parent + current_abstraction[0], signature:type_def}, accumulator.length - 1)  // using index.toString to preserve redefinitions
                current_abstraction = []
                current_abstraction.type = AbstractionType.Expression;
                break;
            case TokenTypes.TypeDeclaration:
                nested_curr_abstr = true;
                var type_def = [];
                type_def.type = AbstractionType.TypeDefinition;
                current_abstraction.push(type_def)
                break;
            case TokenTypes.WindowOpen:
                let type_constr = [current_abstraction.pop()]
                type_constr.type = AbstractionType.CompoundType;
                if (type_constr[0].type == AbstractionType.TypeDefinition) {
                    type_constr[0].type = AbstractionType.CompoundType
                    type_constr.type = AbstractionType.TypeDefinition
                } 
                current_abstraction.push(type_constr);
                break;
            case TokenTypes.WindowClose:
                let index_ = null;
                let type_constr_ = current_abstraction.filter((a, index) => {
                    if (a.type === AbstractionType.CompoundType || (a.type === AbstractionType.TypeDefinition && index_ === null))
                        index_ = index;
                    return index_ === null ? a.type === AbstractionType.CompoundType: index
                })
                if (type_constr_[0].type === AbstractionType.TypeDefinition) {
                    type_constr_ = [type_constr_[0][0].concat(type_constr_.slice(1))]
                    type_constr_.type = AbstractionType.TypeDefinition
                } else
                    type_constr_ = type_constr_[0].concat(type_constr_.slice(1));
                current_abstraction = current_abstraction.slice(0, index_);
                current_abstraction.push(type_constr_)
                break;
            case TokenTypes.KeywordWhere:
                nested_where = true;
                current_abstraction = []
                break;
            case TokenTypes.Guard:
                guards.type = AbstractionType.Guard
                current_abstraction = []
                current_abstraction.type = AbstractionType.Expression
                break;
            case TokenTypes.WhiteSpace:  // Only checks indentation
                current_line_indent += 1;
                break;
            case TokenTypes.Arrow:  // Arrow is not marked in token-stream for type declarations
                guards.push(current_abstraction)
                current_abstraction = []
                current_abstraction.type = AbstractionType.Expression
                break;
            case TokenTypes.InfixCallMarker: // TODO: decide default precedence and associativity
                expr = [current_abstraction.pop(), current_abstraction.pop()]
                expr.type = AbstractionType.Expression;
                current_abstraction.push(expr)
                if (current_abstraction.length == 1)
                    current_abstraction = current_abstraction[0]
                else
                    nested_curr_abstr = true;
                break;
            default:
                break;
        }
        if (index == tokens.length)
            if (guards.length > 0) {
                if (nested_where)
                    accumulator.at(-1).at(-1).push(guards)   // To push Guard inside nested_where
                else
                    accumulator.at(-1).push(guards)
                guards = []
                nested_where = false;
            }
        return [ current_line_indent, prev_line_indent, current_abstraction, guards, nested_where, index, nested_curr_abstr, accumulator ];
    }, [0, 0, [], [], false, 0, false, []]).at(-1)
    console.log(fmtAST(ast))
    for (j of SymbolTable.entries())
        console.log(j)
    return ast;
}

module.exports = { build_ast, language_ast }
