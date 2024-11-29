const { Fit, StringHandler, Exceptions, TokenTypes, RuleTypes, FrontendRuleTypes, __init_handler__ } = require("./helper.js");

const handler = new StringHandler();

const Tokens = {
    ParensOpen: "(", ParensClose: ")", Percentage: '%', Comma: ",", CssSelectorIdDemarcator: '#', Newline: '\n',  Overlay: "||", Height: "^", Width: "_",
    // ~~~~~
    Arrow: '=>', InfixCallMarker: '`', WhiteSpace: ' ', TypeDeclaration: '::', Assignment: '=', SquareBracesOpen: '[', SquareBracesClose: ']', Guard: '|',
    CodeBlockOpen: "\{", CodeBlockClose: "\}", SemiColon: ";"
};
const TokenChecks = {...Tokens};
for (tokenname in Tokens)
    TokenChecks[tokenname] = handler.Literal(Tokens[tokenname]);
    // eval(`TokenChecks[${tokenname}] = handler.Literal(Tokens[tokenname])`)  // For readable error trace during debugging

const REGEX_ESCAPED_RESERVED_SYMBOLS = ['\\(', '\\)', '\\,', '`', '=', '\\|', ':', '\\[', '\\]', '\\{', '\\}', '_', ';']   // reserved symbols/operators
const ComplexTerminals = {
    ParseHtmlTag:       handler.CompositeTerminals("HTML tag", /[a-zA-Z\-]+/, TokenTypes.Selector.TagName, 
                                                    "Expected HTML tag-name to contain only alphabets and '-'!"),
    ParseHtmlID:        handler.CompositeTerminals("HTML ID", /[a-zA-Z][a-zA-Z\-]*/, TokenTypes.Selector.Id,
                                                    "Expected HTML ID to start with an alphabet and contain only alphabets and '-'!"),
    ParseNumerical:     handler.CompositeTerminals("NUMBER", /\d+.?\d*\%/, TokenTypes.NumericalValue,   // TODO: Include other measures, not just percentage (?)
                                                     "Expected a numerical percentage!"),
    // ~~~~~~~~~~~~~~~~~~~
    ParseIdentifier:    handler.CompositeTerminals("identifier", /(?!where|main)[a-zA-Z]+/, TokenTypes.Identifier, 
                                                         "Expected identifier to contain letters!"),
    ParseOperator:      handler.CompositeTerminals("operator", `[^\\w\\s${REGEX_ESCAPED_RESERVED_SYMBOLS.join('')}]+`, TokenTypes.Operator, 
                                                         "Expected an operator (containing symbols)!"),
    ParseInteger:       handler.CompositeTerminals("integer", /\-?\d+/, TokenTypes.Integer),
    ParseFloat:         handler.CompositeTerminals("number with a fractional part", /-?\d+\.\d+/, TokenTypes.Float),
    ParseString:        handler.CompositeTerminals("string", /\".*\"/, TokenTypes.String),
    ParseKeywordWhere:  handler.Literal('where', null),    // don't capture
    ParseKeywordMain:   handler.Literal('main', null),
    ParseBoolean:       handler.CompositeTerminals("boolean", /True|False/, TokenTypes.Boolean),
    ParseWord:          handler.CompositeTerminals(null, /\S*/, 0)  // exists only for use in parser(), to find range for exception
}

function parser(string) {
    handler.construct(string);
    __init_handler__(handler.unmodified_lines);
    let tokenised = tokenised_copy = handler.fitOnce(ParseLanguage, true)
    // handler.fitOnce(ParseFrontend, true).lazy_concat(
    //     handler.fitOnce.bind(handler, ParseLanguage, true)
    // );

    // Throwing error if anything remains on the string stream, unparsed
    // TODO: fix and finish
    /* let old = '';
    while (!tokenised_copy.isToken) {
        old = tokenised_copy.remaining_line;
        tokenised_copy = tokenised_copy.at(-1);
    }
    if (old.trim().length > 0) {
	console.log(old)
        let token = ComplexTerminals.ParseWord(old);
        handler.throwError(Exceptions.SyntaxError, Fit.tokenFailed(token, `Unexpected token '${token}'`));
    } */

    return [tokenised, handler];
}

// Signature of all following functions and TokenChecks.*: Parse<Rule>  string => Fit[token(s)](string)
function ParseFrontend(line) {
    return handler.fitOnce(ParseWindow, true).lazy_concat(
        handler.fitAsManyAsPossible.bind(handler, handler.And([true, true], ParseSelector, ParseWindow))
    );
}

function ParseWindow(line) {
    return handler.encapsulateRule(FrontendRuleTypes.Window,
        handler.fitOnce(TokenChecks.SquareBracesOpen, true).lazy_concat(
            handler.fitAsManyAsPossible.bind(handler, ParseLines),
            handler.fitOnce.bind(handler, TokenChecks.SquareBracesClose)
        ));
}

function ParseLines(line) {
    return handler.encapsulateRule(FrontendRuleTypes.Line,
        handler.fitOnce(TokenChecks.Newline, true).lazy_concat(
            handler.fitAsManyAsPossible.bind(handler, ParseSelectorDimensionPairs)
        )
    );
}

function ParseSelectorDimensionPairs(line) {
    return handler.encapsulateRule(FrontendRuleTypes.Element, 
        handler.fitMaybeOnce(ParseSelector).lazy_concat(
            handler.fitOnce.bind(handler, ParseDimensionSpecification, true),
            handler.fitMaybeOnce.bind(handler, TokenChecks.Overlay)
        ));
}

function ParseSelector(line) {
    return handler.encapsulateRule(FrontendRuleTypes.Selector, 
        handler.fitMaybeOnce(ComplexTerminals.ParseHtmlTag).lazy_concat(
            handler.fitMaybeOnce.bind(handler, handler.And([true], TokenChecks.CssSelectorIdDemarcator, ComplexTerminals.ParseHtmlID))
        ));
}

function ParseDimensionSpecification(line) {
    return handler.fitOnce(TokenChecks.ParensOpen, true).lazy_concat(
        handler.fitOnce.bind(handler, handler.Either(ParseHeight, ParseWidth)),
        handler.fitMaybeOnce.bind(handler, handler.Either(ParseHeight, ParseWidth)),  // TODO: check for height-height and width-width
        handler.fitOnce.bind(handler, TokenChecks.ParensClose)
    );
}

function ParseHeight(line) {
    return handler.encapsulateRule(FrontendRuleTypes.Height, 
        handler.fitOnce(TokenChecks.Height, true).lazy_concat(
            handler.fitOnce.bind(handler, ComplexTerminals.ParseNumerical)
        ));
}

function ParseWidth(line) {
    return handler.encapsulateRule(FrontendRuleTypes.Width, 
        handler.fitOnce(TokenChecks.Width, true).lazy_concat(
            handler.fitOnce.bind(handler, ComplexTerminals.ParseNumerical)
        ));
}
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

function ParseLanguage(line) {
    return handler.fitOnce(handler.And(
		handler.fitAsManyAsPossible.bind(handler, ParseAssignment),
		handler.fitMaybeOnce.bind(handler, ParseMainBlock)
	));
}

function ParseMainBlock(line) {
    return handler.encapsulateRule(RuleTypes.MainBlock,
        handler.fitOnce(ComplexTerminals.ParseKeywordMain, true)
	.lazy_concat(
	    handler.fitOnce.bind(handler, TokenChecks.CodeBlockOpen, false),
	    handler.fitAsManyAsPossible.bind(handler, ParseStmtAndAssignment),
	    handler.fitOnce.bind(handler, TokenChecks.CodeBlockClose, false)
	)
    );
}

function ParseStmtAndAssignment(line) {
    let fit = handler.fitOnce(handler.Either(ParseConstAssignment, 
	ParseStmt), true);
    return fit;
}

function ParseStmt(line) {
    return handler.encapsulateRule(RuleTypes.Statement,
	handler.fitOnce(ParseExpression, true).lazy_concat(
	   handler.fitOnce.bind(handler, TokenChecks.SemiColon, false)
        )
    );
}

function ParseConstAssignment(line) {
    return handler.encapsulateRule(RuleTypes.Assignment,
        handler.fitOnce(handler.And([true, true],
            ComplexTerminals.ParseIdentifier,
            ParseTypeDeclaration,
            TokenChecks.Assignment,
            ParseExpression, TokenChecks.SemiColon), true),
    );
}

function ParseAssignment(line) {
    return handler.encapsulateRule(RuleTypes.Assignment,
        handler.fitOnce(ParseNestedAssignment, true).lazy_concat(
            handler.fitAsManyAsPossible.bind(handler, ParseWhereStatement)
        )
    );
}

function ParseWhereStatement(line) {
    return handler.encapsulateRule(RuleTypes.Where,
        handler.fitOnce(ComplexTerminals.ParseKeywordWhere, true).lazy_concat(
            handler.fitOnce.bind(handler, TokenChecks.WhiteSpace, false),  // fitAtLeastOnce(Whitespace) not used since line is trimmed in terminals
            handler.fitOnce.bind(handler, ParseNestedAssignment, false)
        )
    );
}

function ParseNestedAssignment(line) {
    let assignment = handler.fitOnce(
        handler.Either(ParseFunctionCallWithoutExpressions, ParseInfixFunctionCallWithoutExpressions, ComplexTerminals.ParseIdentifier), true)
    .lazy_concat(
        handler.fitOnce.bind(handler, ParseTypeDeclaration, false),
        handler.fitOnce.bind(handler, TokenChecks.Assignment, false),
        handler.fitOnce.bind(handler, handler.Either(ParseGuards, ParseExpression), false)
    );
    return assignment;
}

function ParseGuards(line) {
    return handler.encapsulateRule(RuleTypes.Guard, handler.fitAtLeastOnce(ParseCaseOfGuard, true));
}

function ParseCaseOfGuard(line) {
    handler.noNewlines = true;
    let out = handler.encapsulateRule(RuleTypes.CaseInGuard,
        handler.fitOnce(TokenChecks.Guard, true).lazy_concat(
            handler.fitOnce.bind(handler, ParseExpression, false),
            handler.fitOnce.bind(handler, TokenChecks.Arrow, false),
            handler.fitOnce.bind(handler, ParseExpression, false)
        )
    );
    handler.noNewlines = false;
    handler.nextFail = false;
    return out;
}

function ParseFunctionCallWithoutExpressions(line) {
    return handler.encapsulateRule(RuleTypes.FnCall,
        handler.fitOnce(ComplexTerminals.ParseIdentifier, true).lazy_concat(
            handler.fitOnce.bind(handler, TokenChecks.ParensOpen, true),
            handler.fitOnce.bind(handler, handler.And(
                ComplexTerminals.ParseIdentifier,
                handler.fitAsManyAsPossible.bind(handler, handler.And([true], TokenChecks.Comma, ComplexTerminals.ParseIdentifier)),  
            ), false),
            handler.fitOnce.bind(handler, TokenChecks.ParensClose, false)
        )
    );
}

function ParseInfixFunctionCallWithoutExpressions(line) {
    let parsed = handler.fitOnce(ComplexTerminals.ParseIdentifier, true).lazy_concat(
        handler.fitOnce.bind(handler, handler.Either(
            ComplexTerminals.ParseOperator, handler.And([true], TokenChecks.InfixCallMarker, ComplexTerminals.ParseIdentifier, TokenChecks.InfixCallMarker)
        ), 
        true),
        handler.fitOnce.bind(handler, ComplexTerminals.ParseIdentifier, false)
    )
    if (!parsed.fail) {
        let temp = parsed[0];
        parsed[0] = parsed[1];
        parsed[1] = temp;
    }
    return handler.encapsulateRule(RuleTypes.FnCall, parsed);
}

function ParseInfixFunctionCall(line) {
    // TODO: implement operator precedence rules
    let parsed = handler.fitOnce(ComplexTerminals.ParseIdentifier, true).lazy_concat(
    // let parsed = handler.fitOnce(ParseParensedExpression, true).lazy_concat(
        handler.fitOnce.bind(handler, handler.Either(
            ComplexTerminals.ParseOperator, handler.And([true], TokenChecks.InfixCallMarker, ComplexTerminals.ParseIdentifier, TokenChecks.InfixCallMarker)
        ), 
        true),
        handler.fitOnce.bind(handler, ParseExpression, false)
        // handler.fitOnce.bind(handler, ParseParensedExpression, false)
    );
    if (!parsed.fail) {
        let temp = parsed[0];
        parsed[0] = parsed[1];
        parsed[1] = temp;
    }
    return handler.encapsulateRule(RuleTypes.FnCall, parsed);
}

function ParseFunctionCall(line) {
    // TODO: fix overfitting, implement new syntax
    // let should_toggle = true;
    // if (handler.noNewlines)
    //     should_toggle = false;
    // handler.noNewlines = true;

    let out = handler.encapsulateRule(RuleTypes.FnCall,
        handler.fitOnce(ComplexTerminals.ParseIdentifier, true).lazy_concat(
            handler.fitOnce.bind(handler, TokenChecks.ParensOpen, true),
            handler.fitOnce.bind(handler, handler.And([true],
                // ParseParensedExpression,
                ParseExpression,
                handler.fitAsManyAsPossible.bind(handler, handler.And([true], TokenChecks.Comma, ParseExpression))
                // handler.fitAsManyAsPossible.bind(handler, ParseParensedExpression)
            ), true),
            handler.fitOnce.bind(handler, TokenChecks.ParensClose, false)
        )
    );

    // if (should_toggle) {
    //     handler.noNewlines = false;
    //     handler.nextFail = false;
    // }
    return out;
}

function ParseTypeDeclaration(line) {
    return handler.encapsulateRule(RuleTypes.TypeDefinition,
        handler.fitOnce(TokenChecks.TypeDeclaration, true).lazy_concat(
            handler.fitOnce.bind(handler, ParseTypeDefConstructor, false),
            handler.fitAsManyAsPossible.bind(handler, handler.And([true], TokenChecks.Arrow, ParseTypeDefConstructor), false)
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
        handler.Either(ComplexTerminals.ParseFloat, ComplexTerminals.ParseInteger, ComplexTerminals.ParseString, ComplexTerminals.ParseBoolean), true
    )
}

function ParseArray(line) {
    return handler.encapsulateRule(RuleTypes.Array,
        handler.fitOnce(TokenChecks.SquareBracesOpen, true).lazy_concat(
            handler.fitAsManyAsPossible.bind(handler, ParseTypeConstructor),
            handler.fitOnce.bind(handler, TokenChecks.SquareBracesClose, false)
        ));
}

function ParseExpression(line) {   // Parses {ParenthesesOpen?, Either(ParseFunctionCall, ParseInfixFunctionCall, ParseIdentifier), ParenthesesClose?}
    return handler.fitOnce(
        handler.Either(ParseFunctionCall, ParseInfixFunctionCall, ParseTypeConstructor, ComplexTerminals.ParseIdentifier),
    true);
}

function ParseParensedExpression(line) {
    return handler.fitOnce(handler.Either(
        ComplexTerminals.ParseIdentifier,
        handler.And([true], TokenChecks.ParensOpen, ParseFunctionCall, TokenChecks.ParensClose),
        handler.And([true], TokenChecks.ParensOpen, ParseInfixFunctionCall, TokenChecks.ParensClose),
        ParseTypeConstructor
    ), true);
}

module.exports = { parser }
