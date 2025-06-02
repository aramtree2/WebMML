import moo from 'https://cdn.skypack.dev/moo';

var mml = document.getElementById("mml");
var result = document.getElementById("LexResult");
var submit = document.getElementById("submit");

let lexer = moo.compile({
    WS: /[ \t]+/,
    Tempo: /[Tt](?:0|[1-9][0-9]{0,2})/,
    Octave: /[Oo](?:0|[1-9][0-9]{0,2})/,
    Volume: /[Vv](?:0|[1-9][0-9]{0,2})/,
    Length: /[Ll](?:0|[1-9][0-9]{0,2})\.?/,
    OctaveUp: /\>/,
    OctaveDown: /\</,
    Note: /[a-gA-G][\+\-]?(?:0|[1-9][0-9]{0,2})?\.?/,
    AbsNote: /[Nn](?:0|[1-9][0-9]{0,2})/,
    Rest: /[Rr](?:0|[1-9][0-9]{0,2})?\.?/,
    tie: /&/,
})

submit.addEventListener("click",()=>{
    parse();
})

function parse()
{
    lexer.reset(mml.value);
    result.innerText = "MML Parse Reult \n"
    var token = lexer.next();
    while(token != null)
    {
        console.log(token);
        result.innerText += `Type : ${token.type} , Value : ${token.value}`;
        result.innerText += "\n";
        var token = lexer.next();
    }
}