import moo from 'https://cdn.skypack.dev/moo';

const submit = document.getElementById("submit");
const cellContainer = document.getElementById("CellContainer");
const editorContainer = document.getElementById("RawMMLEditor");

// === 메인 lexer ===
let lexer = moo.compile({
    WS: /[ \t]+/,
    Newline: { match: /\r?\n/, lineBreaks: true },
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
});

// === 편집 검사용 lexer ===
const editLexer = moo.compile({
    WS: /[ \t]+/,
    Newline: { match: /\r?\n/, lineBreaks: true },
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
});

function isValidTokenValue(newValue, expectedType) {
    editLexer.reset(newValue);

    const first = editLexer.next();
    if (!first || first.type === "Error") return false;

    const second = editLexer.next();
    if (second) return false; // 두 개 이상이면 안 됨

    if (first.type !== expectedType) return false;

    return true;
}

// 삽입용: 문자열 하나가 "토큰 하나"인지 검사하고 타입/값 반환
function parseSingleToken(value) {
    editLexer.reset(value);
    const first = editLexer.next();
    if (!first || first.type === "Error") return null;
    if (first.type === "WS" || first.type === "Newline") return null;
    const second = editLexer.next();
    if (second) return null;
    return first; // {type, value, offset:0, ...}
}

// === 전역 상태 ===
let currentTokens = [];
let cellElements = [];
let lastSelectedCell = null;

// 삽입 모드 임시 상태
let insertingInfo = null; // {offset}

// Monaco 관련
let editor = null;
let monacoInstance = null;
let editorDecorations = [];

// === 셀 영역 빈 곳 클릭 시 선택 해제 ===
if (cellContainer) {
    cellContainer.addEventListener("click", (e) => {
        if (e.target === cellContainer) {
            clearCellSelection();
            clearEditorHighlight();
        }
    });
}

// === Monaco 초기화 ===
window.require.config({
    paths: {
        'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.0/min/vs'
    }
});

window.require(['vs/editor/editor.main'], function (monaco) {
    monacoInstance = monaco;
    editor = monaco.editor.create(editorContainer, {
        value: '',
        language: 'plaintext',
        theme: 'vs-dark',
        automaticLayout: true,
        fontSize: 13,
        minimap: { enabled: false },
        lineNumbers: "off",
        glyphMargin: false,
        folding: false,
        wordWrap: "on",
        occurrencesHighlight: false,
        selectionHighlight: false,

        // 추천/자동완성 끄기
        quickSuggestions: false,
        suggestOnTriggerCharacters: false,
        acceptSuggestionOnEnter: "off",
        wordBasedSuggestions: false,
        tabCompletion: "off",
        parameterHints: { enabled: false }
    });

    // submit 버튼
    submit.addEventListener("click", () => {
        Parse();
    });

    // Raw에서 커서 움직이면 해당 토큰 셀 선택
    editor.onDidChangeCursorPosition((e) => {
        const model = editor.getModel();
        if (!model || !currentTokens.length) return;

        const offset = model.getOffsetAt(e.position);
        const idx = findTokenIndexAtOffset(offset);

        if (idx !== -1) {
            // fromEditor = true → 에디터 스크롤은 건드리지 않음
            selectCellByIndex(idx, true);
        } else {
            clearCellSelection();
            clearEditorHighlight();
        }
    });
});

// ==== 파싱 ====
function Parse() {
    if (!editor) return;

    const text = editor.getValue();
    lexer.reset(text);
    console.log("MML Parse Result\n");

    const tokens = [];
    let errorIndex = -1;

    while (true) {
        const token = lexer.next();
        if (!token) break;

        if (token.type === "Error") {
            console.log("error at", token.offset);
            console.log(
                `[${token.type}] "${token.value[0]}" at offset ${token.offset}, line ${token.line}, column ${token.col}`
            );

            // 에러 토큰은 "첫 글자만" 토큰으로 취급
            const errToken = {
                ...token,
                value: token.value[0]
            };

            errorIndex = tokens.length;
            tokens.push(errToken);
            break; // 첫 에러까지만 처리
        }

        // 공백 / 줄바꿈은 토큰 리스트에서 제외
        if (token.type === "WS" || token.type === "Newline") {
            continue;
        }

        tokens.push(token);
        console.log(`Type : ${token.type} , Value : ${token.value}`);
    }

    currentTokens = tokens;
    insertingInfo = null; // 삽입 모드 초기화
    renderCells(tokens);
    clearEditorHighlight();

    // 에러가 있었다면: 에러 셀 선택 + Raw 에러 위치 빨간 하이라이트
    if (errorIndex !== -1) {
        selectCellByIndex(errorIndex, false);
    }
}

// ==== 셀 렌더링 ====
function renderCells(tokens) {
    if (!cellContainer) return;
    cellContainer.innerHTML = "";
    cellElements = [];
    lastSelectedCell = null;

    tokens.forEach((t, index) => {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.dataset.index = index;

        // 에러 토큰이면 전용 스타일
        if (t.type === "Error") {
            cell.classList.add("cell-error");
        }

        const typeDiv = document.createElement("div");
        typeDiv.className = "cell-type";
        typeDiv.textContent = t.type;

        const valueDiv = document.createElement("div");
        valueDiv.className = "cell-value";
        valueDiv.textContent = t.value;

        cell.appendChild(typeDiv);
        cell.appendChild(valueDiv);

        // 클릭 → 셀 선택 + 에디터 토큰 하이라이트 + 에디터 스크롤
        cell.addEventListener("click", () => {
            if (cell.dataset.editing === "true") return; // 편집 중이면 무시
            selectCellByIndex(index, false); // fromEditor = false
        });

        // 더블클릭 → 인라인 편집
        cell.addEventListener("dblclick", (e) => {
            e.stopPropagation();
            beginInlineEdit(cell, valueDiv, t);
        });

        cellContainer.appendChild(cell);
        cellElements[index] = cell;
    });
}

// ==== 셀 인라인 편집 (기존 토큰 수정) ====
function beginInlineEdit(cell, valueDiv, token) {
    if (cell.dataset.editing === "true") return;
    cell.dataset.editing = "true";

    const original = token.value;

    const input = document.createElement("input");
    input.type = "text";
    input.value = original;
    input.className = "cell-input";

    input.style.width = "100%";
    input.style.boxSizing = "border-box";
    input.style.border = "none";
    input.style.outline = "none";
    input.style.background = "transparent";
    input.style.color = "inherit";
    input.style.font = "inherit";

    valueDiv.textContent = "";
    valueDiv.appendChild(input);

    input.focus();
    input.select();

    let finished = false;

    function applyEdit(value, fromBlur = false) {
        if (finished) return;

        // 값이 그대로면 그냥 취소
        if (value === original) {
            finished = true;
            valueDiv.textContent = original;
            cell.dataset.editing = "false";
            return;
        }

        if (!isValidTokenValue(value, token.type)) {
            if (fromBlur) {
                // 포커스 빠졌고 틀리면 → 취소(원래 값 복구)
                finished = true;
                valueDiv.textContent = original;
                cell.dataset.editing = "false";
            } else {
                // Enter에서 틀리면 → 계속 편집
                input.style.borderBottom = "1px solid red";
                input.focus();
                input.select();
            }
            return;
        }

        // 문법 OK → Monaco 텍스트에 반영
        finished = true;

        if (editor && monacoInstance) {
            const model = editor.getModel();
            if (model) {
                const startOffset = token.offset;
                const endOffset = token.offset + token.value.length;
                const startPos = model.getPositionAt(startOffset);
                const endPos = model.getPositionAt(endOffset);

                model.pushEditOperations(
                    [],
                    [
                        {
                            range: new monacoInstance.Range(
                                startPos.lineNumber,
                                startPos.column,
                                endPos.lineNumber,
                                endPos.column
                            ),
                            text: value
                        }
                    ],
                    () => null
                );
            }
        }

        cell.dataset.editing = "false";
        Parse();
    }

    function cancelEdit() {
        if (finished) return;
        finished = true;
        valueDiv.textContent = original;
        cell.dataset.editing = "false";
    }

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            applyEdit(input.value, false);
        } else if (e.key === "Escape") {
            e.preventDefault();
            cancelEdit();
        }
    });

    input.addEventListener("blur", () => {
        applyEdit(input.value, true);
    });
}

// ==== 새 토큰 삽입: 선택된 셀 뒤에 빈 셀 만들고 입력 ====
function beginInsertAfterSelected() {
    if (!editor || !monacoInstance) return;
    if (insertingInfo) return; // 이미 삽입 중이면 무시

    const model = editor.getModel();
    if (!model) return;

    let insertOffset;
    let insertDomIndex;

    if (lastSelectedCell) {
        // ✅ 셀 선택되어 있으면: 그 셀 "뒤"에 삽입
        const selectedIndex = parseInt(lastSelectedCell.dataset.index, 10);
        if (Number.isNaN(selectedIndex)) return;

        const baseToken = currentTokens[selectedIndex];
        if (!baseToken) return;

        const baseLen =
            baseToken.type === "Error" ? 1 : baseToken.value.length;

        insertOffset = baseToken.offset + baseLen;
        insertDomIndex = selectedIndex + 1; // 선택 셀 다음 위치
    } else {
        // ✅ 선택된 셀 없으면: Raw 맨 끝 / 셀 맨 뒤에 삽입
        const text = model.getValue();
        insertOffset = text.length;
        insertDomIndex = currentTokens.length; // 마지막 셀 뒤
    }

    const refCell = cellElements[insertDomIndex] || null;

    const cell = document.createElement("div");
    cell.className = "cell cell-insert";
    cell.dataset.editing = "true";

    const typeDiv = document.createElement("div");
    typeDiv.className = "cell-type";
    typeDiv.textContent = ""; // 타입은 나중에 결정

    const valueDiv = document.createElement("div");
    valueDiv.className = "cell-value";

    const input = document.createElement("input");
    input.type = "text";
    input.value = "";
    input.className = "cell-input";

    input.style.width = "100%";
    input.style.boxSizing = "border-box";
    input.style.border = "none";
    input.style.outline = "none";
    input.style.background = "transparent";
    input.style.color = "inherit";
    input.style.font = "inherit";

    valueDiv.appendChild(input);
    cell.appendChild(typeDiv);
    cell.appendChild(valueDiv);

    cellContainer.insertBefore(cell, refCell);
    insertingInfo = { offset: insertOffset };

    lastSelectedCell = cell;
    cell.classList.add("selected");

    input.focus();

    let finished = false;

    function applyInsert(value, fromBlur = false) {
        if (finished) return;

        if (value.trim() === "") {
            // 아무것도 안 쓰고 나가면 → 그냥 취소
            finished = true;
            cellContainer.removeChild(cell);
            insertingInfo = null;
            return;
        }

        const parsed = parseSingleToken(value);
        if (!parsed) {
            if (fromBlur) {
                // 틀린 상태에서 포커스 나감 → 삽입 취소
                finished = true;
                cellContainer.removeChild(cell);
                insertingInfo = null;
            } else {
                // Enter로 확정하려다 틀림 → 그대로 편집 유지
                input.style.borderBottom = "1px solid red";
                input.focus();
                input.select();
            }
            return;
        }

        // 문법 OK → Raw에 문자열 삽입
        finished = true;

        const modelNow = editor.getModel();
        if (modelNow) {
            const pos = modelNow.getPositionAt(insertOffset);

            modelNow.pushEditOperations(
                [],
                [
                    {
                        range: new monacoInstance.Range(
                            pos.lineNumber,
                            pos.column,
                            pos.lineNumber,
                            pos.column
                        ),
                        text: value
                    }
                ],
                () => null
            );
        }

        insertingInfo = null;
        Parse(); // 다시 파싱해서 정상 토큰/셀로 갱신
    }

    function cancelInsert() {
        if (finished) return;
        finished = true;
        if (cell.parentNode === cellContainer) {
            cellContainer.removeChild(cell);
        }
        insertingInfo = null;
    }

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            applyInsert(input.value, false);
        } else if (e.key === "Escape") {
            e.preventDefault();
            cancelInsert();
        }
    });

    input.addEventListener("blur", () => {
        applyInsert(input.value, true);
    });
}

// ==== 셀 선택/해제 ====
// fromEditor: Raw에서 온 선택인지 여부 (true면 에디터 스크롤 안 건드림)
function selectCellByIndex(index, fromEditor = false) {
    if (lastSelectedCell) {
        lastSelectedCell.classList.remove("selected");
    }
    const cell = cellElements[index];
    if (!cell) {
        lastSelectedCell = null;
        clearEditorHighlight();
        return;
    }
    cell.classList.add("selected");
    lastSelectedCell = cell;

    highlightTokenInEditor(index, fromEditor);

    // 셀 뷰 스크롤 맞추기
    const containerRect = cellContainer.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    if (cellRect.top < containerRect.top) {
        cellContainer.scrollTop += cellRect.top - containerRect.top - 4;
    } else if (cellRect.bottom > containerRect.bottom) {
        cellContainer.scrollTop += cellRect.bottom - containerRect.bottom + 4;
    }
}

function clearCellSelection() {
    if (lastSelectedCell) {
        lastSelectedCell.classList.remove("selected");
        lastSelectedCell = null;
    }
}

// offset 기준으로 토큰 인덱스 찾기
function findTokenIndexAtOffset(offset) {
    for (let i = 0; i < currentTokens.length; i++) {
        const t = currentTokens[i];
        const start = t.offset;
        const end = t.offset + t.value.length;
        if (offset >= start && offset < end) {
            return i;
        }
    }
    return -1;
}

// ==== 에디터 하이라이트 ====
// fromEditor = true 이면 스크롤은 안 건드림
function highlightTokenInEditor(index, fromEditor = false) {
    if (!editor || !monacoInstance) return;
    const model = editor.getModel();
    if (!model) return;

    const t = currentTokens[index];
    if (!t) return;

    const tokenLength = (t.type === "Error") ? 1 : t.value.length;

    const startOffset = t.offset;
    const endOffset = t.offset + tokenLength;

    const startPos = model.getPositionAt(startOffset);
    const endPos = model.getPositionAt(endOffset);

    const range = new monacoInstance.Range(
        startPos.lineNumber,
        startPos.column,
        endPos.lineNumber,
        endPos.column
    );

    const inlineClass =
        t.type === "Error" ? "mml-token-error" : "mml-token-highlight";

    editorDecorations = editor.deltaDecorations(
        editorDecorations,
        [
            {
                range,
                options: {
                    inlineClassName: inlineClass
                }
            }
        ]
    );

    // 셀에서 온 선택일 때만 에디터 스크롤 맞추기
    if (!fromEditor) {
        editor.revealRangeInCenter(range);
    }
}

function clearEditorHighlight() {
    if (!editor) return;
    editorDecorations = editor.deltaDecorations(editorDecorations, []);
}

// ==== Delete / Insert 키 처리 ====
window.addEventListener("keydown", (e) => {
    // 에디터에 포커스 있으면 Monaco 기본 동작 유지
    if (editor && editor.hasTextFocus && editor.hasTextFocus()) return;

    // 셀 인풋 편집 중이면 텍스트 입력용으로만 사용
    if (document.activeElement &&
        document.activeElement.classList &&
        document.activeElement.classList.contains("cell-input")) {
        return;
    }

    // Delete: 선택된 셀 토큰 삭제
    if (e.key === "Delete") {
        if (!lastSelectedCell) return;

        const index = parseInt(lastSelectedCell.dataset.index, 10);
        const token = currentTokens[index];
        if (!token || !editor || !monacoInstance) return;

        const model = editor.getModel();
        if (!model) return;

        const tokenLength = (token.type === "Error") ? 1 : token.value.length;

        const startOffset = token.offset;
        const endOffset = token.offset + tokenLength;

        const startPos = model.getPositionAt(startOffset);
        const endPos = model.getPositionAt(endOffset);

        const range = new monacoInstance.Range(
            startPos.lineNumber,
            startPos.column,
            endPos.lineNumber,
            endPos.column
        );

        e.preventDefault();

        model.pushEditOperations(
            [],
            [
                {
                    range,
                    text: "" // 삭제
                }
            ],
            () => null
        );

        Parse();
        return;
    }

    // Insert: 선택된 셀 뒤에 새 토큰 삽입
    if (e.key === "Insert") {
        e.preventDefault();
        beginInsertAfterSelected();
        return;
    }
});
