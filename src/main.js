const { readFile, writeFile } = require("node:fs")
const { JSDOM }  = require("jsdom");
const beautify_html = require("js-beautify").html;
const { GCD, fmtAST } = require("./helper.js")
const { parser } = require("./parser.js");
const { semanticAnalyzer, lookup, setStringHandler } = require("./semantic_analysis.js");
const { constructWasm, codeGenSetGlobals } = require("./codeGenWASM.js");
const wabt = require("wabt");

// TODO: macro-isation, local-isation, lazy evaluation

const devDebugOptions  = {
    "":            (AST, context, WASM) => '',
    undefined:     (AST, context, WASM) => '',
    "all":  (AST, context, WASM) => `${fmtAST(AST, true)} ${context} ${fmtAST(WASM, true)}`,
    "ast"    : (AST, context, WASM) => fmtAST(AST, true),
    "context": (AST, context, WASM) => context,
    "context.signs": (AST, context, WASM) => context.signatures,
    "context.locals": (AST, context, WASM) => context.locals,
    "context.defs": (AST, context, WASM) => context.definitions,
    "context.localDefs": (AST, context, WASM) => context.localDefinitions,
    "wasm": (AST, context, WASM) => fmtAST(WASM, true)
}

const devDebug         = process.argv.slice(2).map((arg) => devDebugOptions[arg] || (_ => ''));
const input_filepath   = "./__input__/home.ptless";
const output_filepath  = "./__output__/home.html";
const output_wasm_path = "./__output__/home.wasm";
const run              = false;  // TODO: WASM executer

require('util').inspect.defaultOptions.depth = 50;

readFile(input_filepath, "utf-8", (err, fileContents) => {
    if (err)
        console.error(`File Read Error (reading "${input_filepath}"): ${err}`);
    let [AST, handler] = parser(fileContents);

    setStringHandler(handler);
    let context = semanticAnalyzer(AST);

    codeGenSetGlobals(context, lookup, handler);
    let output = constructWasm();

    console.log(...devDebug.map(fn => fn(AST, context, output)));

    // writeFile(output_filepath, constructHtml(AST), 
    //     (err) => err ? console.error(`File Write Error (writing to "${output_filepath}"): ${err}`) : null
    // );

    writeFile(output_wasm_path, fmtAST(output),
        (err) => err ? console.error(`File Write Error (writing to "${output_wasm_path}"): ${err}`) : null
    );

    // let WASM = parseWat(output_wasm_path).toBinary()
})

function constructHtml(ast) {
    const dom = new JSDOM();
    boilerplateHtml(dom.window.document, ast);
    for (const group of Object.values(ast))
        for (const lines of Object.values(group))
            for (const fit of lines) {
                element = dom.window.document.createElement(!fit.htmlTag ? null: fit.htmlTag);
                if (fit.htmlId)
                    element.id = fit.htmlId;
                dom.window.document.querySelector(fit.parent.cssSelector).appendChild(element);
            }
    return beautify_html(dom.serialize());
}

function boilerplateHtml(document, ast) {
    document.querySelector('html').setAttribute('lang', 'en')
    let head = document.querySelector('head')

    let meta_charset = document.createElement('meta')
    meta_charset.setAttribute('charset', 'utf-8')
    head.appendChild(meta_charset)

    let meta_viewport = document.createElement('meta')
    meta_viewport.setAttribute('name', 'viewport')
    meta_viewport.setAttribute('content', 'width=device-width,initial-scale=1')
    head.appendChild(meta_viewport)

    let title = document.createElement('title')
    title.innerHTML = 'placeholder'  // TODO: ...
    head.appendChild(title)

    // let CSS = document.createElement('link');
    // CSS.setAttribute('rel', 'stylesheet')
    // CSS.setAttribute('href', 'style.css')
    // head.appendChild(CSS)
    let CSS = document.createElement('style');
    CSS.innerHTML = constructCSS(ast)
    head.appendChild(CSS)
}

// TODO: Positioning for overlayed elements
// TODO: Fix gridding for y-values
function constructCSS(symbols) {
    CSS = {
        rules: [],
        toString: function () {
            let a = ''
            for (sel of this.rules) {
                const {selector, ...stuff} = sel
                a += `${selector} {`
                for (pair of Object.entries(stuff))
                    a += `${pair[0]}:${pair[1]};`;
                a += `}`
            }
            return a;
        }
    }
    for (group in symbols) {
        widths = []
        heights = []
        Object.values(symbols[group]).forEach(
            (line) => line.forEach(
                (symbol) => {  // TODO: define undefined dimensions
                    if (symbol.dimensions.width !== undefined)
                        widths.push(Number(symbol.dimensions.width.replace('%', '')));
                    if (symbol.dimensions.height !== undefined)
                        heights.push(Number(symbol.dimensions.height.replace('%', '')));
                    var a = {}
                    if (symbol.cssSelector) {
                        a.selector = symbol.cssSelector
                        a['grid-area'] = symbol.cssSelector.replace('#', '_')
                    } else {
                        symbol.cssSelector = '...'  // For grid-template-area
                        return;
                    }
                    if (symbol.z_index > 0)
                        a = {
                            selector:symbol.cssSelector, 
                            position:'absolute', 
                            'z-index': symbol.z_index,
                            ...symbol.dimensions
                        };
                    CSS.rules.push(a);
                }
            )
        )
        width = GCD(widths)
        height = GCD(heights)
        CSS.rules.push(
            {selector: group, display: 'grid', 
            'grid-template-areas': Object.keys(symbols[group]).reduce( 
                (acc, line) => acc + 
                `\n'${symbols[group][line].reduce(
                    (acc, s) => s.z_index === 0 ? 
                        acc + s.cssSelector.replace('#', '_').concat(' ').repeat(Number(s.dimensions.width.replace('%', ''))/width)
                        : acc, 
                    '')}'`,
                '')
            })
    }
    return CSS.toString()
}
