import moo from 'https://cdn.skypack.dev/moo';

var mml = document.getElementById("mml");
var result = document.getElementById("result");

const lexer = moo.compile({
    Note: /[a-g]/,
    Num: /0|[1-9][0-9]{0,2}/
});


lexer.reset("c d 123 001");
result.innerText = "MML Parse Reult \n"
for (let token of lexer)
{
    result.innerText += token;
    result.innerText += "\n";
}