const TokenTypes = {
    Newline:        0,
    Selector: {
        TagName:    1, 
        Id:         2
    },
    NumericalValue: 3,
    Height:         4,
    Width:          5,
    Overlay:        6,
    WindowOpen:     7,
    WindowClose:    8,
    // ~~~~
    InfixCallMarker:9,
    Assignment:     10,
    KeywordWhere:   11,
    Guard:          12,
    Divider:        13,
    Arrow:          14,
    Identifier:     15,
    Operator:       16,
    TypeDeclaration:17,
    ParensOpen:     18,
    ParensClose:    19,
    WhiteSpace:     20,
    Integer:        21,
    Float:          22,
    String:         23,
    Boolean:        24
}

const RuleTypes = {
    TypeDefinition: 0,
    Assignment:     1,
    Guard:          2,
    Where:          3,
    FnCall:         4,
    CompoundType:   5,
    CaseInGuard:    6,
    Array:          7
}

const FrontendRuleTypes = {
    Line: 0,
    Window: 1,
    Height: 2,
    Width: 3,
    Selector: 4,
    Element: 5
}

class Token extends String {
    isToken=true;
    constructor(value, type, ln, range=[]) {
        super(value)
        this.tokenType = type
        this.line_number = ln
        this.range=range;
    }
}

class Fit extends Array {
    remaining_line = "";
    line_number=1;
    fail = false;
    throw = false;
    constructor(line, line_number) {
        super()
        this.remaining_line = line;
        this.line_number = line_number;
    }
    lazy_concat(...args) {
        if (this.fail) {
            if (this.throw) {
                StringHandler.throwError(Exceptions.SyntaxError, this);   // TODO: don't use StringHandler.throwError, use handler.throwError
            }
            return this;
        }
        for (let bound_fn of args) {
            let el = bound_fn(this.remaining_line);
            if (el.fail) {
                if (el.throw) {
                    StringHandler.throwError(Exceptions.SyntaxError, el);
                }
                return el;
            }
            if (el.length > 0)
                el.forEach((element) => this.push(element));
            this.remaining_line = el.remaining_line
        }
        return this;
    }
    concat(...args) {
        if (this.fail) {
            return this;
        }
        for (let el of args) {
            if (el.fail) {
                return el;
            }
            if (el.length > 0)
                el.forEach((element) => this.push(element));
        }
        let last = args.pop()
        this.remaining_line = last.remaining_line
        return this;
    }
    fitFailed(expected, range, message=null, throw_=false, and_or = "and/or") {
        this.fail = true
        if (typeof expected != "string") {
            expected = [...new Set(expected)];  // weed out repeated elements
            this.expected = expected.slice(1).reduce((acc, e) => acc + ` ${and_or} ${e}`, `${expected[0]}`);
        } else
            this.expected = (expected.len > 2 ? expected : "'" + expected + "'");
        this.range = range
        this.message = message ? message : "Expected "+ this.expected + '!'
        this.throw = throw_
        return this;
    }
    static tokenFailed(token, message) {
        let f = new Fit('', token.line_number);
        f.fail = true;
        f.expected = '';
        f.line_number = token.line_number;
        f.range = token.range;
        f.message = message;
        f.throw = true;
        return f;
    }
}

class PointlessException extends Error {   // Extends Error to allow for error trace during debugging
    line_number=0;
    concerned_line="";
    erroneous_pos_=""
    cursor_position=0;
    expected=null;
    message='';
    constructor(message, line_number, concerned_line, cursor_range, expected)
    {
        super(message);
        this.message = message;
        this.name = this.constructor.name;
        this.line_number = line_number;
        this.cursor_range = cursor_range;
        this.concerned_line = concerned_line
        this.expected = expected;
        this.erroneous_pos_=`${" ".repeat(this.cursor_range[0])}${"^".repeat(cursor_range[1] - cursor_range[0])}`;
    }
    toString () {  /** Returns formatted string to print during errors */
        let rule_parse_suffix = '';
        if (this.parsing_rule)
            rule_parse_suffix = ` while parsing rule '${this.parsing_rule}'`;
        return `\x1b[31mError at line number \x1b[34m${this.line_number}${rule_parse_suffix}\x1b[0m\n`+ 
               `\x1b[34m>>>\x1b[0m ${this.concerned_line}\n` +
               `\x1b[34m... ${this.erroneous_pos_}\x1b[0m\n` +
               `\x1b[4m\x1b[35m${this.name}\x1b[0m: \x1b[90m${this.message}\x1b[0m\n`;
    }
}

class SyntaxError extends PointlessException {constructor() {super(...arguments);}}
class TypeError extends PointlessException {constructor() {super(...arguments)}}
class NameError extends PointlessException {constructor() {super(...arguments)}}
const Exceptions = {
    SyntaxError: SyntaxError,
    TypeError: TypeError,
    NameError: NameError
}

class StringHandler {
    line_number = 1;
    lines = [];
    unmodified_lines = []
    current_line_remnant = "";
    errorOccurred = false;
    noNewlines = false;
    nextFail = false;
    LINE_COMMENT_REGEXP = /\/\/.*/g
    construct(string) {
        this.unmodified_lines = string.split('\r\n')
        this.lines = string.replaceAll(this.LINE_COMMENT_REGEXP, ' ')   // Remove comments
                            .split('\r\n')
                            .map((value) => value.trimEnd())
        this.current_line_remnant = this.lines[0];
    }
    static throwError(error, fit) {  // TODO: only for Fit.lazy_concat, REMOVE
        let e = new error(fit.message, fit.line_number, fit.line, fit.range, fit.expected);
        // throw e;  // Uncomment this line for error trace during debugging
        console.error(e.toString());
        process.exit(1);
    }
    throwError(error, fit) {
        let e = new error(fit.message, fit.line_number, this.unmodified_lines[fit.line_number-1], fit.range, fit.expected);
        // throw e;  // Uncomment this line for error trace during debugging
        console.error(e.toString());
        process.exit(1);
    }
    throwErrorWithoutExit(error, fit) {
        let e = new error(fit.message, fit.line_number, this.unmodified_lines[fit.line_number-1], fit.range, fit.expected);
        this.errorOccurred = true;
        console.error(e.toString());
    }
    CompositeTerminals(expected, expression, token_type=null, msg=null) {
        // TODO: something better than regexp?
        return function ComposedCompositeTerminal(input_string) {
            if (input_string.length == 0) {
                this.nextLine({remaining_line: ''});
                input_string = this.current_line_remnant;
            }

            if (!" \t\n".match(expression)) {  // i.e. expression does not check for whitespace (weak check)
                input_string = input_string.trimStart();
            }

            let startRange = this.lines[this.line_number - 1].length - input_string.length;

            let match = input_string.match(expression);   // assumes expression doesn't have `g` flag
            if (!match || match.index !== 0) {
                return new Fit(input_string, this.line_number).fitFailed(expected, [startRange, startRange+2], msg);
            }

            let f = new Fit(input_string.slice(match[0].length), this.line_number);
            if (token_type != null)
                f.push(new Token(match[0], token_type, this.line_number, [startRange, startRange + match[0].length]));
            return f;
        }.bind(this);
    }
    Literal(literal, capture=null) {
        return function ComposedLiteral(string_stream) {
            if (string_stream.trim().length == 0) {
                this.nextLine({remaining_line: ''});
                string_stream = this.current_line_remnant;
            }

            if (literal != ' ' && literal != '\t' && literal != '\n') {
                string_stream = string_stream.trimStart();
            }

            let startRange = this.lines[this.line_number - 1].length - string_stream.length;

            if (string_stream.slice(0, literal.length) === literal) {
                let f = new Fit(string_stream.slice(literal.length), this.line_number)

                if (capture !== null)
                    f.push(new Token(literal, capture, this.line_number, [startRange, startRange + literal.length]));
                return f;
            }
            else {
                return new Fit(string_stream, this.line_number).fitFailed(literal, [startRange, startRange + literal.length]);
            }
        }.bind(this);
    }
    Either(...fns) {
        return function BoundEither(line) {
            let errors = []
            let old_line_num = this.line_number;
            let line_length = this.lines[this.line_number - 1].length;
            let startRange = line_length - line.length;
            for (var fn of fns) {
                this.current_line_remnant = line;  // backtrack
                this.line_number = old_line_num;
                let fit = this.fitOnce(fn, true);
                if (fit.fail)
                    errors.push(fit.expected);
                else
                    return fit;
            } 
            return new Fit(this.current_line_remnant).fitFailed(errors, [startRange, line_length]);
        }.bind(this);
    }
    And(looking_ahead=null, ...fns) {
        if (typeof looking_ahead == "function") {
            var fns = [looking_ahead, ...fns];
            var looking_ahead = null;
        }
        if (looking_ahead === null)
            var looking_ahead = [];
        return function BoundAnd(line) {
            let bigfit = new Fit(line);
            let fns_with_args = [];
            for (let i in fns) {
                fns_with_args.push(this.fitOnce.bind(this, fns[i], looking_ahead[i] ? true : false));  // convert from (possibly) undefined to boolean
            }
            return bigfit.lazy_concat(...fns_with_args);
        }.bind(this);
    }
    fitAsManyAsPossible(fn) {
        let bigfit = new Fit(this.current_line_remnant);
        while (true) {
            let fit = fn(this.current_line_remnant);
            if (fit.fail || this.nextFail) {
                this.nextFail = false;
                return bigfit;
            }
            bigfit.concat(this.nextLine(fit));
            if (this.current_line_remnant === '')
                return bigfit;
        }
    }
    fitOnce(fn, looking_ahead=false) {
        let fit = fn(this.current_line_remnant);
        if (fit.fail || this.nextFail) {
            this.nextFail = false;
            fit.line_number = this.line_number
            fit.line = this.unmodified_lines[this.line_number - 1]
            fit.throw = !looking_ahead;
            return fit;
        }
        return this.nextLine(fit);
    }
    fitMaybeOnce(fn) {
        let fit = fn(this.current_line_remnant);
        if (fit.fail || this.nextFail) {
            this.nextFail = false;
            return new Fit(this.current_line_remnant);
        }
        return this.nextLine(fit);
    }
    fitAtLeastOnce(fn, looking_ahead=false)  {
        return this.fitOnce(fn, looking_ahead).lazy_concat(
            this.fitAsManyAsPossible.bind(this, fn)
        );
    }
    nextLine(fit) {
        if (fit.remaining_line.length > 0) {
            this.current_line_remnant = fit.remaining_line;
        } else if (this.line_number < this.lines.length) {
            if (this.noNewlines)
                this.nextFail = true;  // next token must fail

            while (this.line_number < this.lines.length) {
                this.current_line_remnant = this.lines[this.line_number]
                this.line_number += 1
                if (this.current_line_remnant.length == 0)
                    continue;
                fit.remaining_line = this.current_line_remnant;
                break;
            }
        } else {
            this.current_line_remnant = '';
        }
        return fit;
    }
    encapsulateRule(rule_type, fit, while_parsing_rule='') {
        if (fit.fail) {
            fit.parsing_rule = while_parsing_rule;
            return fit;
        } else {
            fit.rule_type = rule_type
            let f = new Fit(fit.remaining_line)
            f.push(fit)
            return f;
        }
    }
}

class Symbol {
    /** Used to build AST in ast.js */
    // TODO: OBSOLETE (sort of)
    cssSelector;
    dimensions;
    htmlId;
    htmlTag;
    parent;
    line_number;
    z_index;
    constructor(htmlId=null, htmlTag=null, dimensions=null, parent=null, line_number, z_index=0) {
        this.htmlId = htmlId;
        this.htmlTag = htmlTag
        this.dimensions = dimensions;
        this.parent = parent;
        this.line_number = line_number;
        this.z_index = z_index;
    }
    construct_CSS_selector() {
        let htmlId = '#' + this.htmlId
        if (this.htmlId === '')
            htmlId = ''
        this.cssSelector = this.htmlTag + htmlId
    }
}

function GCD(args) {  /** Finds the GCD of an array of numbers */
    if (args.length === 0)
        return 1;
    return args.reduce(
        (acc, i) => {
            var b = Math.min(acc, i);
            var rem = Math.max(acc, i) % b;
            while(rem > 0) {
                var [b, rem] = [rem, b % rem];
            }
            return b;
        }
    );
}

function fmtAST(ast) {
    const RuleTypeStrings = ['TypeDef', 'Def', 'Guard', 'Where', 'FnCall', 'CType', 'Case', 'Array']
    output = ""
    for (line of ast) {
        let indent1 = '', indent2 = '', nl = '';
        if (line.rule_type === RuleTypes.Assignment)
            nl = '\n'
        else if (line.rule_type === RuleTypes.Where || line.wat_indent) {
            indent1 = '\n\t';
            indent2 = indent1 + '\t';
        } else if (line.rule_type === RuleTypes.Guard){
            indent1 = '\n\t\t';
            indent2 = indent1 + '\t';
        } else if (line.rule_type === RuleTypes.CaseInGuard)
            indent1 = '\n\t\t\t';
        else if (line.wat_newline)
            indent1 = '\n';
        if (line.isToken || typeof line == "string") // i.e. line is a token
            output += line + ' '
        else
            if (line.rule_type && line.rule_type != RuleTypes.FnCall && line.rule_type != RuleTypes.CompoundType)
                output += (indent1 + RuleTypeStrings[line.rule_type] + ':(' + indent2 + fmtAST(line).trim() + ') ' + nl)
            else
                output += indent1 + '(' + fmtAST(line).trim() + ') ';
    }
    return output
}

module.exports = { Token, Fit, StringHandler, Symbol, Exceptions, TokenTypes, RuleTypes, FrontendRuleTypes, GCD, fmtAST }
