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
    Tie: /&/,
    Error: moo.error,
})

submit.addEventListener("click",()=>{
    Parse();
})

function Parse()
{
    lexer.reset(mml.value);
    result.value = "MML Parse Reult \n"
    function ParseStep()
    {
        result.scrollTop = result.scrollHeight;
        var token = lexer.next();
        if (!token) return;
        if(token.type == "Error")
        {
            console.log("error");
            mml.focus();
            mml.setSelectionRange(token.offset, token.offset + 1);
            result.value += `[${token.type}] "${token.value[0]}" at offset ${token.offset}, line ${token.line}, column ${token.col}`;
            return;
        }
        result.value += `Type : ${token.type} , Value : ${token.value}`;
        result.value += "\n";

        requestAnimationFrame(ParseStep);
    }
    
    requestAnimationFrame(ParseStep);
}