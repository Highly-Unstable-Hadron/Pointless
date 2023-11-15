const { Fit, StringHandler, Exceptions, TokenTypes, RuleTypes } = require("./helper.js");

const handler = new StringHandler();

// TODO: something still wrong with exceptions

const Tokens = {
    PositionOpen: "(", PositionClose: ")", Percentage: '%', Comma: ",", CssSelectorIdDemarcator: '#',
    // ~~~~~
    Arrow: '=>', InfixCallMarker: '`', WhiteSpace: ' ', TypeDeclaration: '::', Assignment: '=', SquareBracesOpen: '[', SquareBracesClose: ']', Guard: '|'
};
const TokenChecks = {...Tokens};
for (tokenname in Tokens)
    TokenChecks[tokenname] = handler.Literal(Tokens[tokenname]);
    // eval(`TokenChecks[${tokenname}] = handler.Literal(Tokens[tokenname])`)  // For readable error trace during debugging

const CapturedTokens = {
    WindowOpen: "[", WindowClose: "]", Newline: "\n", Overlay: "||", Height: "^", Width: "_",
    // ~~~~~
    ParensOpen: '(', ParensClose: ')'
}
const CapturedTokenChecks = {...CapturedTokens};
for (tokenname in CapturedTokenChecks)
    CapturedTokenChecks[tokenname] = handler.Literal(CapturedTokens[tokenname], TokenTypes[tokenname]);
    // eval(`TokenChecks[${tokenname}] = handler.Literal(CapturedTokens[tokenname], TokenTypes[tokenname])`)  // For readable error trace during debugging

const REGEX_ESCAPED_RESERVED_SYMBOLS = ['\\(', '\\)', '\\,', '`', '=', '\\|', ':', '\\[', '\\]', '\\{', '\\}', '_']   // reserved symbols/operators
const ComplexTerminals = {
    ParseHtmlTag:       handler.CompositeTerminals("HTML tag", /[a-zA-Z\-]+/, TokenTypes.Selector.TagName, 
                                                    "Expected HTML tag-name to contain only alphabets and '-'!"),
    ParseHtmlID:        handler.CompositeTerminals("HTML ID", /[a-zA-Z][a-zA-Z\-]*/, TokenTypes.Selector.Id,
                                                    "Expected HTML ID to start with an alphabet and contain only alphabets and '-'!"),
    ParseNumerical:     handler.CompositeTerminals("NUMBER", /\d+.?\d*\%/, TokenTypes.NumericalValue,   // TODO: Include other measures, not just percentage (?)
                                                     "Expected a numerical percentage!"),
    // ~~~~~~~~~~~~~~~~~~~
    ParseIdentifier:    handler.CompositeTerminals("identifier", /[a-zA-Z]+/, TokenTypes.Identifier, 
                                                         "Expected identifier to contain letters!"),
    ParseOperator:      handler.CompositeTerminals("operator", `[^\\w\\s${REGEX_ESCAPED_RESERVED_SYMBOLS.join('')}]+`, TokenTypes.Operator, 
                                                         "Expected an operator (containing symbols)!"),
    ParseInteger:       handler.CompositeTerminals("integer", /\-?\d+/, TokenTypes.Integer),
    ParseFloat:         handler.CompositeTerminals("number with a fractional part", /-?\d+\.\d+/, TokenTypes.Float),
    ParseString:        handler.CompositeTerminals("string", /\".*\"/, TokenTypes.String),
    ParseKeywordWhere:  handler.Literal('where', null),    // don't capture
    ParseBoolean:       handler.CompositeTerminals("boolean", /True|False/, TokenTypes.Boolean)
}

function parser(string) {
    handler.construct(string);
    let tokenised = handler.fitOnce(ParseLanguage, true)
    // handler.fitOnce(ParseFrontend, true).lazy_concat(
    //     handler.fitOnce.bind(handler, ParseLanguage, true)
    // );

    last_error = handler.errors.at(-1)
    if (tokenised.fail) {
        console.log(tokenised, last_error)
        if (tokenised.expected === "' '") {
            if (last_error && last_error.line && last_error.line_number)
                StringHandler.throwError(Exceptions.SyntaxError, last_error);
        } else
            StringHandler.throwError(Exceptions.SyntaxError, tokenised);
    }
    return tokenised;
}

// Signature of all following functions and TokenChecks and CapturedTokenChecks, (reverse accumulator): Parse<Rule>  string => Fit[token(s)](string)
function ParseFrontend(line) {
    return handler.fitOnce(ParseWindow, true).lazy_concat(
        handler.fitAsManyAsPossible.bind(handler, handler.And([true, true], ParseSelector, ParseWindow))
    );
}

function ParseWindow(line) {
    return handler.fitOnce(CapturedTokenChecks.WindowOpen, true).lazy_concat(
        handler.fitAsManyAsPossible.bind(handler, ParseSelectorDimensionPairs),
        handler.fitOnce.bind(handler, CapturedTokenChecks.WindowClose)
    );
}

function ParseSelectorDimensionPairs(line) {
    return handler.fitMaybeOnce(ParseSelector).lazy_concat(
        handler.fitOnce.bind(handler, ParseDimensionSpecification, true),
        handler.fitMaybeOnce.bind(handler, handler.Either(TokenChecks.Comma, CapturedTokenChecks.Overlay)) // TODO: enforce Comma properly here too, if needed
    );
}

function ParseSelector(line) {
    return handler.fitMaybeOnce(ComplexTerminals.ParseHtmlTag).lazy_concat(
        handler.fitMaybeOnce.bind(handler, handler.And([true], TokenChecks.CssSelectorIdDemarcator, ComplexTerminals.ParseHtmlID))
    );
}

function ParseDimensionSpecification(line) {
    return handler.fitOnce(TokenChecks.PositionOpen, true).lazy_concat(
        handler.fitOnce.bind(handler, ParseDimension),
        handler.fitMaybeOnce.bind(handler, handler.And([true], TokenChecks.Comma, ParseDimension)),  // TODO: Is comma needed?  If so, enforce with fitOnce
        handler.fitOnce.bind(handler, TokenChecks.PositionClose)
    );
}

function ParseDimension(line) {
    return handler.fitOnce(handler.Either(CapturedTokenChecks.Height, CapturedTokenChecks.Width), true).lazy_concat(
        handler.fitOnce.bind(handler, ComplexTerminals.ParseNumerical),
    );
}

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

let SymbolTable = new Map();

function ParseLanguage(line) {
    let a = handler.fitAsManyAsPossible(ParseAssignment).lazy_concat(
        handler.fitOnce.bind(handler, TokenChecks.WhiteSpace)  // TODO:...
    );
    // console.log(SymbolTable)
    return a;
}

function ParseAssignment(line) {
    // TODO: construct symbol table and check for errors
    let assignment_ast = handler.encapsulateRule(RuleTypes.Assignment,
        handler.fitOnce(ParseNestedAssignment, true).lazy_concat(
            handler.fitAsManyAsPossible.bind(handler, ParseWhereStatement)
        )
    );
    if (!assignment_ast.fail) {

    }
    return assignment_ast;
}

function ParseWhereStatement(line) {
    let ast_snip = handler.encapsulateRule(RuleTypes.Where,
        handler.fitOnce(ComplexTerminals.ParseKeywordWhere, true).lazy_concat(
            handler.fitOnce.bind(handler, TokenChecks.WhiteSpace),  // fitAtLeastOnce(Whitespace) not used since line is trimmed in terminals
            handler.fitOnce.bind(handler, ParseNestedAssignment)
        )
    );
    if (!ast_snip.fail) {
        ast_snip[0][1].remaining_line = null;  // so that identical type defs aren't mistaken to be different by SymbolTable
        let key = String(ast_snip[0][0][0]) + " " + String(ast_snip[0][1]) 
            // ['nested_assignment', true]
        // if (SymbolTable.has(key))
        //     StringHandler.throwError(Exceptions.IdentifierError, ast_snip);
        SymbolTable.set(key, {arg_names: ast_snip[0][0].slice(1,), definition: ast_snip[0][2]});
    }
    return ast_snip;
}

function ParseNestedAssignment(line) {
    // TODO: construct symbol table
    return handler.fitOnce(handler.Either(ParseFunctionCallWithoutExpressions, ParseInfixFunctionCallWithoutExpressions, ComplexTerminals.ParseIdentifier), true)
    .lazy_concat(
        handler.fitOnce.bind(handler, ParseTypeDeclaration, true),
        handler.fitOnce.bind(handler, TokenChecks.Assignment, false),
        handler.fitOnce.bind(handler, handler.Either(ParseGuards, ParseExpression))
    );

}

function ParseGuards(line) {
    return handler.encapsulateRule(RuleTypes.Guard, handler.fitAtLeastOnce(ParseCaseOfGuard, true));
}

function ParseCaseOfGuard(line) {
    return handler.encapsulateRule(RuleTypes.CaseInGuard,
        handler.fitOnce(TokenChecks.Guard, true).lazy_concat(
            handler.fitOnce.bind(handler, ParseExpression),
            handler.fitOnce.bind(handler, TokenChecks.Arrow),
            handler.fitOnce.bind(handler, ParseExpression)
        )
    );
}

function ParseFunctionCallWithoutExpressions(line) {
    return handler.encapsulateRule(RuleTypes.FnCall,
        handler.fitOnce(ComplexTerminals.ParseIdentifier, true).lazy_concat(
            handler.fitOnce.bind(handler, TokenChecks.PositionOpen, true),
            handler.fitOnce.bind(handler, handler.And(
                ComplexTerminals.ParseIdentifier,
                handler.fitAsManyAsPossible.bind(handler, handler.And([true], TokenChecks.Comma, ComplexTerminals.ParseIdentifier)),  
            )),
            handler.fitOnce.bind(handler, TokenChecks.PositionClose)
        )
    );
}

function ParseInfixFunctionCallWithoutExpressions(line) {
    let parsed = handler.fitOnce(ComplexTerminals.ParseIdentifier, true).lazy_concat(
        handler.fitOnce.bind(handler, handler.Either(
            ComplexTerminals.ParseOperator, handler.And([true], TokenChecks.InfixCallMarker, ComplexTerminals.ParseIdentifier, TokenChecks.InfixCallMarker)
        ), 
        true),
        handler.fitOnce.bind(handler, ComplexTerminals.ParseIdentifier)
    )
    if (!parsed.fail) {
        let temp = parsed[0];
        parsed[0] = parsed[1];
        parsed[1] = temp;
    }
    return handler.encapsulateRule(RuleTypes.FnCall, parsed);
}

function ParseInfixFunctionCall(line) {
    // TODO: use expressions instead of identifiers without a thousand recursive calls
    let parsed = handler.fitOnce(ComplexTerminals.ParseIdentifier, true).lazy_concat(
        handler.fitOnce.bind(handler, handler.Either(
            ComplexTerminals.ParseOperator, handler.And([true], TokenChecks.InfixCallMarker, ComplexTerminals.ParseIdentifier, TokenChecks.InfixCallMarker)
        ), 
        true),
        handler.fitOnce.bind(handler, ParseExpression)
    );
    if (!parsed.fail) {
        let temp = parsed[0];
        parsed[0] = parsed[1];
        parsed[1] = temp;
    }
    return handler.encapsulateRule(RuleTypes.FnCall, parsed);
}

function ParseFunctionCall(line) {
    return handler.encapsulateRule(RuleTypes.FnCall,
        handler.fitOnce(ComplexTerminals.ParseIdentifier, true).lazy_concat(
            handler.fitOnce.bind(handler, TokenChecks.PositionOpen, true),
            handler.fitOnce.bind(handler, handler.And([],
                ParseExpression,
                handler.fitAsManyAsPossible.bind(handler, handler.And([true], TokenChecks.Comma, ParseExpression)),  
            )),
            handler.fitOnce.bind(handler, TokenChecks.PositionClose)
        )
    );
}

function ParseTypeDeclaration(line) {
    return handler.encapsulateRule(RuleTypes.TypeDefinition,
        handler.fitOnce(TokenChecks.TypeDeclaration).lazy_concat(
            handler.fitOnce.bind(handler, ParseTypeDefConstructor),
            handler.fitAsManyAsPossible.bind(handler, handler.And([true], TokenChecks.Arrow, ParseTypeDefConstructor))
        )
    );
}

function ParseTypeDefConstructor(line) {
    let constr = handler.fitOnce(ComplexTerminals.ParseIdentifier, true).lazy_concat(
        handler.fitMaybeOnce.bind(handler,handler.And([true], 
            TokenChecks.SquareBracesOpen, 
            ComplexTerminals.ParseIdentifier,
            handler.fitAsManyAsPossible.bind(handler, handler.And([true], TokenChecks.Comma, ComplexTerminals.ParseIdentifier)),
            TokenChecks.SquareBracesClose
            )
        )
    );
    if (constr.length > 1) {
        return handler.encapsulateRule(RuleTypes.CompoundType, constr);
    }
    return constr;
}

function ParseTypeConstructor(line) {
    return handler.fitOnce(
        handler.Either(ComplexTerminals.ParseInteger, ComplexTerminals.ParseFloat, ComplexTerminals.ParseString, ComplexTerminals.ParseBoolean), true
    )
}

function ParseArray(line) {
    return handler.fitOnce(CapturedTokenChecks.WindowOpen, true).lazy_concat(
        handler.fitAsManyAsPossible.bind(handler, ParseTypeConstructor),
        handler.fitOnce.bind(CapturedTokenChecks.WindowClose)
    )
}

function ParseExpression(line) {   // Parses {ParenthesesOpen?, Either(ParseFunctionCall, ParseInfixFunctionCall, ParseIdentifier), ParenthesesClose?}
    // TODO: fix no_closing_parens

    // let old_line_remnant = handler.current_line_remnant;
    // let old_line_num = handler.line_number;
    // let no_closing_parens = (handler.fitMaybeOnce(CapturedTokenChecks.ParensOpen).length == 0)  // To match number of closing parens
    // handler.current_line_remnant = old_line_remnant;
    // handler.line_number = old_line_num;
    // return no_closing_parens ?

    //return handler.encapsulateRule(RuleTypes.Expression,
    return handler.fitOnce(handler.Either(ParseFunctionCall, ParseInfixFunctionCall, ParseTypeConstructor, ComplexTerminals.ParseIdentifier), true)
    //);

                            //   : handler.fitOnce(
                            //     handler.And(CapturedTokenChecks.ParensOpen, 
                            //         handler.Either(ParseFunctionCall, ParseInfixFunctionCall, ComplexTerminals.ParseIdentifier), 
                            //         CapturedTokenChecks.ParensClose), 
                            //     true);
}

module.exports = { parser }
