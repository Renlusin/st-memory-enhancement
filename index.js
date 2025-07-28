import { APP, BASE, DERIVED, EDITOR, SYSTEM, USER } from './core/manager.js';
import { openTableRendererPopup, updateSystemMessageTableStatus } from "./scripts/renderer/tablePushToChat.js";
import { loadSettings } from "./scripts/settings/userExtensionSetting.js";
import { ext_getAllTables, ext_exportAllTablesAsJson } from './scripts/settings/standaloneAPI.js';
import { openTableDebugLogPopup } from "./scripts/settings/devConsole.js";
import { TableTwoStepSummary } from "./scripts/runtime/separateTableUpdate.js";
import { initTest } from "./components/_fotTest.js";
import { initAppHeaderTableDrawer, openAppHeaderTableDrawer } from "./scripts/renderer/appHeaderTableBaseDrawer.js";
import { initRefreshTypeSelector } from './scripts/runtime/absoluteRefresh.js';
import {refreshTempView, updateTableContainerPosition} from "./scripts/editor/tableTemplateEditView.js";
import { functionToBeRegistered } from "./services/debugs.js";
import { parseLooseDict, replaceUserTag } from "./utils/stringUtil.js";
import {executeTranslation} from "./services/translate.js";
import applicationFunctionManager from "./services/appFuncManager.js"
import {SheetBase} from "./core/table/base.js";
import { Cell } from "./core/table/cell.js";

console.log("______________________记忆插件：开始加载______________________")

const VERSION = '2.2.0'

const editErrorInfo = {
    forgotCommentTag: false,
    functionNameError: false,
}

// Thêm hỗ trợ locale tự động
let currentLocale = 'en'; // Default
if (navigator.language.startsWith('vi')) {
    currentLocale = 'vi';
} else if (navigator.language.startsWith('zh')) {
    currentLocale = 'zh-cn';
}

// Load locale file động
async function loadLocale() {
    try {
        const localeData = await import(`./assets/locales/${currentLocale}.json`);
        window.translations = localeData.default;
        console.log(`Loaded locale: ${currentLocale}`);
    } catch (error) {
        console.warn(`Locale ${currentLocale} not found, falling back to en`);
        const fallback = await import('./assets/locales/en.json');
        window.translations = fallback.default;
    }
}

/**
 * 修复值中不正确的转义单引号
 * @param {*} value
 * @returns
 */
function fixUnescapedSingleQuotes(value) {
    if (typeof value === 'string') {
        return value.replace(/\\'/g, "'");
    }
    if (typeof value === 'object' && value !== null) {
        Object.keys(value).forEach(key => {
            value[key] = fixUnescapedSingleQuotes(value[key]);
        });
    }
    return value;
}

/**
 * 通过表格索引查找表格结构
 * @param {number} index 表格索引
 * @returns 此索引的表格结构
 */
export function findTableStructureByIndex(index) {
    return USER.tableBaseSetting.tableStructure[index];
}

/**
 * 检查数据是否为Sheet实例，不是则转换为新的Sheet实例
 * @param {Object[]} dataTable 所有表格对象数组
 */
function checkPrototype(dataTable) {
    return dataTable; // Giữ nguyên vì đã dùng Sheet mới
}

export function buildSheetsByTemplates(targetPiece) {
    BASE.sheetsData.context = [];
    const templates = BASE.templates;
    templates.forEach(template => {
        if (template.enable === false) return;
        if (!template || !template.hashSheet || !Array.isArray(template.hashSheet) || template.hashSheet.length === 0 || !Array.isArray(template.cellHistory)) {
            console.error(`[Memory Enhancement] Invalid template structure. Skipping:`, template);
            return;
        }
        try {
            const newSheet = BASE.createChatSheetByTemp(template);
            newSheet.save(targetPiece);
        } catch (error) {
            EDITOR.error(`[Memory Enhancement] Error creating/saving sheet from template:`, error.message, error);
        }
    });
    BASE.updateSelectBySheetStatus();
    USER.saveChat();
}

/**
 * 转化旧表格为sheets
 * @param {DERIVED.Table[]} oldTableList 旧表格数据
 */
export function convertOldTablesToNewSheets(oldTableList, targetPiece) {
    const sheets = [];
    for (const oldTable of oldTableList) {
        const valueSheet = [oldTable.columns, ...oldTable.content].map(row => ['', ...row]);
        const cols = valueSheet[0].length;
        const rows = valueSheet.length;
        const targetSheetUid = BASE.sheetsData.context.find(sheet => sheet.name === oldTable.tableName)?.uid;
        if (targetSheetUid) {
            const targetSheet = BASE.getChatSheet(targetSheetUid);
            console.log("Table exists, updating data", targetSheet);
            targetSheet.rebuildHashSheetByValueSheet(valueSheet);
            targetSheet.save(targetPiece);
            addOldTablePrompt(targetSheet);
            sheets.push(targetSheet);
            continue;
        }
        const newSheet = BASE.createChatSheet(cols, rows);
        newSheet.name = oldTable.tableName;
        newSheet.domain = SheetBase.SheetDomain.chat;
        newSheet.type = newSheet.SheetType.dynamic;
        newSheet.enable = oldTable.enable;
        newSheet.required = oldTable.Required;
        newSheet.tochat = true;
        newSheet.triggerSend = false;
        newSheet.triggerSendDeep = 1;
        addOldTablePrompt(newSheet);
        newSheet.data.description = `${oldTable.note}\n${oldTable.initNode}\n${oldTable.insertNode}\n${oldTable.updateNode}\n${oldTable.deleteNode}`;
        valueSheet.forEach((row, rowIndex) => {
            row.forEach((value, colIndex) => {
                const cell = newSheet.findCellByPosition(rowIndex, colIndex);
                cell.data.value = value;
            });
        });
        newSheet.save(targetPiece);
        sheets.push(newSheet);
    }
    console.log("Converted old tables to new sheets", sheets);
    return sheets;
}

/**
 * 添加旧表格结构中的提示词到新的表格中
 * @param {*} sheet 表格对象
 */
function addOldTablePrompt(sheet) {
    const tableStructure = USER.tableBaseSetting.tableStructure.find(table => table.tableName === sheet.name);
    console.log("Adding old table prompt", tableStructure, USER.tableBaseSetting.tableStructure, sheet.name);
    if (!tableStructure) return false;
    const source = sheet.source;
    source.required = tableStructure.Required;
    source.data.initNode = tableStructure.initNode;
    source.data.insertNode = tableStructure.insertNode;
    source.data.updateNode = tableStructure.updateNode;
    source.data.deleteNode = tableStructure.deleteNode;
    source.data.note = tableStructure.note;
}

/**
 * 寻找下一个含有表格数据的消息，如寻找不到，则返回null
 * @param startIndex 开始寻找的索引
 * @param isIncludeStartIndex 是否包含开始索引
 * @returns 寻找到的mes数据
 */
export function findNextChatWhitTableData(startIndex, isIncludeStartIndex = false) {
    if (startIndex === -1) return { index: -1, chat: null };
    const chat = USER.getContext().chat;
    for (let i = isIncludeStartIndex ? startIndex : startIndex + 1; i < chat.length; i++) {
        if (chat[i].is_user === false && chat[i].dataTable) {
            checkPrototype(chat[i].dataTable);
            return { index: i, chat: chat[i] };
        }
    }
    return { index: -1, chat: null };
}

/**
 * 搜寻最后一个含有表格数据的消息，并生成提示词
 * @returns 生成的完整提示词
 */
export function initTableData(eventData) {
    const allPrompt = USER.tableBaseSetting.message_template.replace('{{tableData}}', getTablePrompt(eventData));
    const promptContent = replaceUserTag(allPrompt); // Thay thế <user> tag
    console.log("Full prompt", promptContent);
    return promptContent;
}

/**
 * 获取表格相关提示词
 * @returns {string} 表格相关提示词
 */
export function getTablePrompt(eventData, isPureData = false) {
    const lastSheetsPiece = BASE.getReferencePiece();
    if (!lastSheetsPiece) return '';
    console.log("Got reference table data", lastSheetsPiece);
    return getTablePromptByPiece(lastSheetsPiece, isPureData);
}

/**
 * 通过piece获取表格相关提示词
 * @param {Object} piece 聊天片段
 * @returns {string} 表格相关提示词
 */
export function getTablePromptByPiece(piece, isPureData = false) {
    const { hash_sheets } = piece;
    const sheets = BASE.hashSheetsToSheets(hash_sheets)
        .filter(sheet => sheet.enable)
        .filter(sheet => sheet.sendToContext !== false);
    console.log("Building prompt info (filtered)", hash_sheets, sheets);
    const customParts = isPureData ? ['title', 'headers', 'rows'] : ['title', 'node', 'headers', 'rows', 'editRules'];
    const customPrompt = sheets.map((sheet, index) => sheet.getTableText(index, customParts, piece)).join('\n');
    return customPrompt;
}

/**
 * 将匹配到的整体字符串转化为单个语句的数组
 * @param {string[]} matches 匹配到的整体字符串
 * @returns 单条执行语句数组
 */
function handleTableEditTag(matches) {
    const functionRegex = /(updateRow|insertRow|deleteRow)\(/g;
    let A = [];
    let match;
    let positions = [];
    matches.forEach(input => {
        while ((match = functionRegex.exec(input)) !== null) {
            positions.push({
                index: match.index,
                name: match[1].replace("Row", "") // Chuyển thành update/insert/delete
            });
        }
        for (let i = 0; i < positions.length; i++) {
            const start = positions[i].index;
            const end = i + 1 < positions.length ? positions[i + 1].index : input.length;
            const fullCall = input.slice(start, end);
            const lastParenIndex = fullCall.lastIndexOf(")");
            if (lastParenIndex !== -1) {
                const sliced = fullCall.slice(0, lastParenIndex);
                const argsPart = sliced.slice(sliced.indexOf("(") + 1);
                const args = argsPart.match(/("[^"]*"|\{.*\}|[0-9]+)/g)?.map(s => s.trim());
                if (!args) continue;
                A.push({
                    type: positions[i].name,
                    param: args,
                    index: positions[i].index,
                    length: end - start
                });
            }
        }
    });
    return A;
}

/**
 * 检查表格编辑字符串是否 thay đổi
 * @param {Chat} chat 单个聊天对象
 * @param {string[]} matches 新的匹配对象
 * @returns
 */
function isTableEditStrChanged(chat, matches) {
    if (chat.tableEditMatches != null && chat.tableEditMatches.join('') === matches.join('')) {
        return false;
    }
    chat.tableEditMatches = matches;
    return true;
}

/**
 * 清除表格中的 tất cả hàng rỗng
 */
function clearEmpty() {
    DERIVED.any.waitingTable.forEach(table => {
        table.clearEmpty();
    });
}

/**
 * 处理 văn bản内の表格编辑事件
 * @param {Chat} chat 单个聊天对象
 * @param {number} mesIndex 修改的消息索引
 * @param {boolean} ignoreCheck 是否跳过重复性检查
 * @returns
 */
export function handleEditStrInMessage(chat, mesIndex = -1, ignoreCheck = false) {
    parseTableEditTag(chat, mesIndex, ignoreCheck);
    updateSystemMessageTableStatus();
}

/**
 * 解析回复中的表格编辑标签
 * @param {*} piece 单个聊天对象
 * @param {number} mesIndex 修改的消息索引
 * @param {boolean} ignoreCheck 是否跳过重复性检查
 */
export function parseTableEditTag(piece, mesIndex = -1, ignoreCheck = false) {
    const { matches } = getTableEditTag(piece.mes);
    if (!ignoreCheck && !isTableEditStrChanged(piece, matches)) return false;
    const tableEditActions = handleTableEditTag(matches);
    console.log("Parsed table edit commands", tableEditActions);

    const { piece: prePiece } = mesIndex === -1 ? BASE.getLastSheetsPiece(1) : BASE.getLastSheetsPiece(mesIndex - 1, 1000, false);
    const sheets = BASE.hashSheetsToSheets(prePiece.hash_sheets).filter(sheet => sheet.enable);
    console.log("Execution info", sheets);
    for (const EditAction of sortActions(tableEditActions)) {
        executeAction(EditAction, sheets);
    }
    sheets.forEach(sheet => sheet.save(piece, true));
    console.log("Chat templates:", BASE.sheetsData.context);
    console.log("Total chat test", USER.getContext().chat);
    return true;
}

/**
 * 直接通过编辑指令字符串执行操作
 * @param {string[]} matches 编辑指令字符串
 */
export function executeTableEditActions(matches, referencePiece) {
    const tableEditActions = handleTableEditTag(matches);
    tableEditActions.forEach((action, index) => tableEditActions[index].action = classifyParams(formatParams(action.param)));
    console.log("Parsed table edit commands", tableEditActions);

    const sheets = BASE.getChatSheets().filter(sheet => sheet.enable);
    if (!sheets || sheets.length === 0) {
        console.error("executeTableEditActions: No enabled tables found, operation aborted.");
        return false;
    }

    console.log("Execution info (from BASE.getChatSheets)", sheets);
    for (const EditAction of sortActions(tableEditActions)) {
        executeAction(EditAction, sheets);
    }

    const { piece: currentPiece } = USER.getChatPiece();
    if (!currentPiece) {
        console.error("executeTableEditActions: Cannot get current chat piece, save failed.");
        return false;
    }
    sheets.forEach(sheet => sheet.save(currentPiece, true));

    console.log("Chat templates:", BASE.sheetsData.context);
    console.log("Total chat test", USER.getContext().chat);
    return true;
}

/**
 * 执行单个action指令
 */
function executeAction(EditAction, sheets) {
    const action = EditAction.action;
    const sheet = sheets[action.tableIndex];
    if (!sheet) {
        console.error("Table not found, cannot execute edit", EditAction);
        return -1;
    }

    if (action.data) {
        action.data = fixUnescapedSingleQuotes(action.data);
    }
    switch (EditAction.type) {
        case 'update':
            const rowIndex = action.rowIndex ? parseInt(action.rowIndex) : 0;
            if (rowIndex >= sheet.getRowCount() - 1) return executeAction({ ...EditAction, type: 'insert' }, sheets);
            if (!action.data) return;
            Object.entries(action.data).forEach(([key, value]) => {
                const cell = sheet.findCellByPosition(rowIndex + 1, parseInt(key) + 1);
                if (!cell) return -1;
                cell.newAction(Cell.CellAction.editCell, { value }, false);
            });
            break;
        case 'insert': {
            const cell = sheet.findCellByPosition(sheet.getRowCount() - 1, 0);
            if (!cell) return -1;
            cell.newAction(Cell.CellAction.insertDownRow, {}, false);
            const lastestRow = sheet.getRowCount() - 1;
            const cells = sheet.getCellsByRowIndex(lastestRow);
            if (!cells || !action.data) return;
            cells.forEach((cell, index) => {
                if (index === 0) return;
                cell.data.value = action.data[index - 1];
            });
            break;
        }
        case 'delete':
            const deleteRow = parseInt(action.rowIndex) + 1;
            const cell = sheet.findCellByPosition(deleteRow, 0);
            if (!cell) return -1;
            cell.newAction(Cell.CellAction.deleteSelfRow, {}, false);
            break;
    }
    console.log("Executed table edit", EditAction);
    return 1;
}

/**
 * 为actions排序
 * @param {Object[]} actions 要排序的actions
 * @returns 排序后的actions
 */
function sortActions(actions) {
    const priority = {
        update: 0,
        insert: 1,
        delete: 2
    };
    return actions.sort((a, b) => (priority[a.type] === 2 && priority[b.type] === 2) ? (b.action.rowIndex - a.action.rowIndex) : (priority[a.type] - priority[b.type]));
}

/**
 * 格式化参数
 * @description 将参数数组中的字符串转换为数字或对象
 * @param {string[]} paramArray
 * @returns
 */
function formatParams(paramArray) {
    return paramArray.map(item => {
        const trimmed = item.trim();
        if (!isNaN(trimmed) && trimmed !== "") {
            return Number(trimmed);
        }
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            const parsed = parseLooseDict(trimmed);
            if (typeof parsed === 'object' && parsed !== null) {
                Object.keys(parsed).forEach(key => {
                    if (!/^\d+$/.test(key)) {
                        delete parsed[key];
                    }
                });
            }
            return parsed;
        }
        return trimmed;
    });
}

/**
 * 分类参数
 * @param {string[]} param 参数
 * @returns {Object} 分类后的参数对象
 */
function classifyParams(param) {
    const action = {};
    for (const key in param) {
        if (typeof param[key] === 'number') {
            if (key === '0') action.tableIndex = param[key];
            else if (key === '1') action.rowIndex = param[key];
        } else if (typeof param[key] === 'object') {
            action.data = param[key];
        }
    }
    return action;
}

/**
 * 执行回复中得编辑标签
 * @param {Chat} chat 单个聊天对象
 * @param {number} mesIndex 修改的消息索引
 */
function executeTableEditTag(chat, mesIndex = -1, ignoreCheck = false) {
    if (mesIndex !== -1) {
        const { index, chat: nextChat } = findNextChatWhitTableData(mesIndex);
        if (index !== -1) handleEditStrInMessage(nextChat, index, true);
    }
}

/**
 * 干运行获取插入action的插入位置和表格插入更新内容
 */
function dryRunExecuteTableEditTag() {
    // TODO 使用新的Sheet系统处理表格编辑
}

/**
 * 获取生成的操作函数字符串
 * @returns 生成的操作函数字符串
 */
export function getTableEditActionsStr() {
    const tableEditActionsStr = DERIVED.any.tableEditActions.filter(action => action.able && action.type !== 'Comment').map(tableEditAction => tableEditAction.format()).join('\n');
    return "\n<!--\n" + (tableEditActionsStr === '' ? '' : (tableEditActionsStr + '\n')) + '-->\n';
}

/**
 * 替换聊天中的TableEdit标签内的内容
 * @param {*} chat 聊天对象
 */
export function replaceTableEditTag(chat, newContent) {
    if (/<tableEdit>.*?<\/tableEdit>/gs.test(chat.mes)) {
        chat.mes = chat.mes.replace(/<tableEdit>(.*?)<\/tableEdit>/gs, `<tableEdit>${newContent}</tableEdit>`);
    } else {
        chat.mes += `\n<tableEdit>${newContent}</tableEdit>`;
    }
    if (chat.swipes != null && chat.swipe_id != null) {
        if (/<tableEdit>.*?<\/tableEdit>/gs.test(chat.swipes[chat.swipe_id])) {
            chat.swipes[chat.swipe_id] = chat.swipes[chat.swipe_id].replace(/<tableEdit>(.*?)<\/tableEdit>/gs, `<tableEdit>\n${newContent}\n</tableEdit>`);
        } else {
            chat.swipes[chat.swipe_id] += `\n<tableEdit>${newContent}</tableEdit>`;
        }
    }
    USER.getContext().saveChat();
}

/**
 * 读取设置中的注入角色
 * @returns 注入角色
 */
function getMesRole() {
    switch (USER.tableBaseSetting.injection_mode) {
        case 'deep_system':
            return 'system';
        case 'deep_user':
            return 'user';
        case 'deep_assistant':
            return 'assistant';
    }
}

/**
 * 注入表格总体提示词
 * @param {*} eventData
 * @returns
 */
async function onChatCompletionPromptReady(eventData) {
    try {
        if (USER.tableBaseSetting.step_by_step === true) {
            if (USER.tableBaseSetting.isExtensionAble === true && USER.tableBaseSetting.isAiReadTable === true) {
                const tableData = getTablePrompt(eventData, true);
                if (tableData) {
                    const finalPrompt = `Dưới đây là thông tin cảnh hiện tại và lịch sử được ghi bằng bảng, bạn cần tham khảo để suy nghĩ:\n${tableData}`;
                    if (USER.tableBaseSetting.deep === 0) {
                        eventData.chat.push({ role: getMesRole(), content: finalPrompt });
                    } else {
                        eventData.chat.splice(-USER.tableBaseSetting.deep, 0, { role: getMesRole(), content: finalPrompt });
                    }
                    console.log("Step-by-step mode: Injected read-only table data", eventData.chat);
                }
            }
            return;
        }

        if (eventData.dryRun === true ||
            USER.tableBaseSetting.isExtensionAble === false ||
            USER.tableBaseSetting.isAiReadTable === false ||
            USER.tableBaseSetting.injection_mode === "injection_off") {
            return;
        }

        console.log("Before generating prompt", USER.getContext().chat);
        const promptContent = initTableData(eventData);
        if (USER.tableBaseSetting.deep === 0) {
            eventData.chat.push({ role: getMesRole(), content: promptContent });
        } else {
            eventData.chat.splice(-USER.tableBaseSetting.deep, 0, { role: getMesRole(), content: promptContent });
        }

        await updateSheetsView();
    } catch (error) {
        EDITOR.error(`Nhớ plugin: Inject dữ liệu bảng thất bại\nLý do:`, error.message, error);
    }
    console.log("Injected overall table prompt", eventData.chat);
}

/**
 * Macro lấy prompt
 */
function getMacroPrompt() {
    try {
        if (USER.tableBaseSetting.isExtensionAble === false || USER.tableBaseSetting.isAiReadTable === false) return "";
        if (USER.tableBaseSetting.step_by_step === true) {
            const promptContent = replaceUserTag(getTablePrompt(undefined, true));
            return `Dưới đây là thông tin cảnh hiện tại và lịch sử được ghi bằng bảng, bạn cần tham khảo để suy nghĩ:\n${promptContent}`;
        }
        const promptContent = initTableData();
        return promptContent;
    } catch (error) {
        EDITOR.error(`Nhớ plugin: Inject macro prompt thất bại\nLý do:`, error.message, error);
        return "";
    }
}

/**
 * Macro lấy prompt bảng
 */
function getMacroTablePrompt() {
    try {
        if (USER.tableBaseSetting.isExtensionAble === false || USER.tableBaseSetting.isAiReadTable === false) return "";
        if (USER.tableBaseSetting.step_by_step === true) {
            const promptContent = replaceUserTag(getTablePrompt(undefined, true));
            return promptContent;
        }
        const promptContent = replaceUserTag(getTablePrompt());
        return promptContent;
    } catch (error) {
        EDITOR.error(`Nhớ plugin: Inject macro prompt thất bại\nLý do:`, error.message, error);
        return "";
    }
}

/**
 * Cắt string, xóa khoảng trắng và tag chú thích
 * @param {string} str Input string edit command
 * @returns
 */
function trimString(str) {
    const str1 = str.trim();
    if (!str1.startsWith("<!--") || !str1.endsWith("-->")) {
        editErrorInfo.forgotCommentTag = true;
    }
    return str1
        .replace(/^\s*<!--|-->?\s*$/g, "")
        .trim();
}

/**
 * Lấy nội dung tag tableEdit trong bảng
 * @param {string} mes String chính văn bản tin nhắn
 * @returns {matches} Mảng nội dung khớp
 */
export function getTableEditTag(mes) {
    const regex = /<tableEdit>(.*?)<\/tableEdit>/gs;
    const matches = [];
    let match;
    while ((match = regex.exec(mes)) !== null) {
        matches.push(match[1]);
    }
    const updatedText = mes.replace(regex, "");
    return { matches };
}

/**
 * Kích hoạt khi tin nhắn được chỉnh sửa
 * @param this_edit_mes_id ID tin nhắn này
 */
async function onMessageEdited(this_edit_mes_id) {
    if (USER.tableBaseSetting.isExtensionAble === false || USER.tableBaseSetting.step_by_step === true) return;
    const chat = USER.getContext().chat[this_edit_mes_id];
    if (chat.is_user === true || USER.tableBaseSetting.isAiWriteTable === false) return;
    try {
        handleEditStrInMessage(chat, parseInt(this_edit_mes_id));
    } catch (error) {
        EDITOR.error("Nhớ plugin: Chỉnh sửa bảng thất bại\nLý do:", error.message, error);
    }
    updateSheetsView();
}

/**
 * Kích hoạt khi nhận tin nhắn
 * @param {number} chat_id ID tin nhắn này
 */
async function onMessageReceived(chat_id) {
    if (USER.tableBaseSetting.isExtensionAble === false) return;
    if (USER.tableBaseSetting.step_by_step === true && USER.getContext().chat.length > 2) {
        TableTwoStepSummary("auto");
    } else {
        if (USER.tableBaseSetting.isAiWriteTable === false) return;
        const chat = USER.getContext().chat[chat_id];
        console.log("Nhận tin nhắn", chat_id);
        try {
            handleEditStrInMessage(chat);
        } catch (error) {
            EDITOR.error("Nhớ plugin: Tự động thay đổi bảng thất bại\nLý do:", error.message, error);
        }
    }

    updateSheetsView();
}

/**
 * Phân tích tất cả macro {{GET::...}} trong chuỗi
 * @param {string} text - Văn bản cần phân tích
 * @returns {string} - Văn bản sau khi phân tích và thay thế macro
 */
function resolveTableMacros(text) {
    if (typeof text !== 'string' || !text.includes('{{GET::')) {
        return text;
    }

    return text.replace(/{{GET::\s*([^:]+?)\s*:\s*([A-Z]+\d+)\s*}}/g, (match, tableName, cellAddress) => {
        const sheets = BASE.getChatSheets();
        const targetTable = sheets.find(t => t.name.trim() === tableName.trim());

        if (!targetTable) {
            return `<span style="color: red">[GET: Không tìm thấy bảng "${tableName}"]</span>`;
        }

        try {
            const cell = targetTable.getCellFromAddress(cellAddress);
            const cellValue = cell ? cell.data.value : undefined;
            return cellValue !== undefined ? cellValue : `<span style="color: orange">[GET: Không tìm thấy ô "${cellAddress}" trong "${tableName}"]</span>`;
        } catch (error) {
            console.error(`Lỗi resolve GET macro cho ${tableName}:${cellAddress}`, error);
            return `<span style="color: red">[GET: Xử lý lỗi]</span>`;
        }
    });
}

/**
 * Kích hoạt khi chat thay đổi
 */
async function onChatChanged() {
    try {
        updateSheetsView();

        document.querySelectorAll('.mes_text').forEach(mes => {
            if (mes.dataset.macroProcessed) return;

            const originalHtml = mes.innerHTML;
            const newHtml = resolveTableMacros(originalHtml);

            if (originalHtml !== newHtml) {
                mes.innerHTML = newHtml;
                mes.dataset.macroProcessed = true;
            }
        });

    } catch (error) {
        EDITOR.error("Nhớ plugin: Xử lý thay đổi chat thất bại\nLý do:", error.message, error);
    }
}

/**
 * Sự kiện swipe tin nhắn
 */
async function onMessageSwiped(chat_id) {
    if (USER.tableBaseSetting.isExtensionAble === false || USER.tableBaseSetting.isAiWriteTable === false) return;
    const chat = USER.getContext().chat[chat_id];
    console.log("Swipe tin nhắn", chat);
    if (!chat.swipe_info[chat.swipe_id]) return;
    try {
        handleEditStrInMessage(chat);
    } catch (error) {
        EDITOR.error("Nhớ plugin: Swipe thất bại\nLý do:", error.message, error);
    }

    updateSheetsView();
}

/**
 * Khôi phục bảng ở mức độ chỉ định
 */
export async function undoSheets(deep) {
    const { piece, deep: findDeep } = BASE.getLastSheetsPiece(deep);
    if (findDeep === -1) return;
    console.log("Undo dữ liệu bảng", piece, findDeep);
    handleEditStrInMessage(piece, findDeep, true);
    updateSheetsView();
}

/**
 * Cập nhật view bảng mới
 * @description Cập nhật view bảng, sử dụng hệ thống Sheet mới
 * @returns {Promise<*[]>}
 */
async function updateSheetsView(mesId) {
    try {
        console.log("========================================\nCập nhật view bảng");
        refreshTempView(true);
        console.log("========================================\nCập nhật view nội dung bảng");
        BASE.refreshContextView(mesId);

        updateSystemMessageTableStatus();
    } catch (error) {
        EDITOR.error("Nhớ plugin: Cập nhật view bảng thất bại\nLý do:", error.message, error);
    }
}

/**
 * Mở drawer bảng
 */
export function openDrawer() {
    const drawer = $('#table_database_settings_drawer .drawer-toggle');
    if (isDrawerNewVersion()) {
        applicationFunctionManager.doNavbarIconClick.call(drawer);
    } else {
        return openAppHeaderTableDrawer();
    }
}

/**
 * Kiểm tra drawer là phiên bản mới hay cũ
 */
export function isDrawerNewVersion() {
    return !!applicationFunctionManager.doNavbarIconClick;
}

jQuery(async () => {
    await loadLocale(); // Load locale trước khi chạy

    window.stMemoryEnhancement = {
        ext_getAllTables,
        ext_exportAllTablesAsJson,
        VERSION,
    };

    fetch("http://api.muyoo.com.cn/check-version", {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientVersion: VERSION, user: USER.getContext().name1 })
    }).then(res => res.json()).then(res => {
        if (res.success) {
            if (!res.isLatest) {
                $("#tableUpdateTag").show();
                $("#setting_button_new_tag").show();
            }
            if (res.toastr) EDITOR.warning(res.toastrText);
            if (res.message) $("#table_message_tip").html(res.message);
        }
    }).catch(error => console.error("Version check failed:", error));

    $('.extraMesButtons').append('<div title="Xem bảng" class="mes_button open_table_by_id">Bảng</div>');

    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
        console.log("Thiết bị di động");
    } else {
        console.log("Thiết bị máy tính");
        initTest();
    }

    $('#translation_container').after(await SYSTEM.getTemplate('index'));
    $('#extensions-settings-button').after(await SYSTEM.getTemplate('appHeaderTableDrawer'));

    loadSettings();

    $(document).on('click', '.open_table_by_id', function () {
        const messageId = parseInt($(this).closest('.mes').attr('mesid'));
        if (USER.getContext().chat[messageId].is_user === true) {
            toastr.warning('Tin nhắn người dùng không hỗ trợ chỉnh sửa bảng');
            return;
        }
        BASE.refreshContextView(messageId);
        openDrawer();
    });

    USER.getContext().registerMacro("tablePrompt", () => getMacroPrompt());
    USER.getContext().registerMacro("tableData", () => getMacroTablePrompt());
    USER.getContext().registerMacro("GET_ALL_TABLES_JSON", () => {
        try {
            const jsonData = ext_exportAllTablesAsJson();
            return Object.keys(jsonData).length === 0 ? "{}" : JSON.stringify(jsonData);
        } catch (error) {
            console.error("GET_ALL_TABLES_JSON macro error:", error);
            EDITOR.error("Xuất tất cả dữ liệu bảng thất bại.", "", error);
            return "{}";
        }
    });

    if (isDrawerNewVersion()) {
        $('#table_database_settings_drawer .drawer-toggle').on('click', applicationFunctionManager.doNavbarIconClick);
    } else {
        $('#table_drawer_content').attr('data-slide-toggle', 'hidden').css('display', 'none');
        $('#table_database_settings_drawer .drawer-toggle').on('click', openAppHeaderTableDrawer);
    }

    $(document).on('click', '.tableEditor_renderButton', function () {
        openTableRendererPopup();
    });
    $(document).on('click', '#table_debug_log_button', function () {
        openTableDebugLogPopup();
    });
    $(document).on('click', '.open_table_by_id', function () {
        initRefreshTypeSelector();
    });
    $(document).on('change', '.tableEditor_switch', function () {
        let index = $(this).data('index');
        const tableStructure = findTableStructureByIndex(index);
        tableStructure.enable = $(this).prop('checked');
    });

    await initAppHeaderTableDrawer();
    functionToBeRegistered();

    executeTranslation();

    APP.eventSource.on(APP.event_types.MESSAGE_RECEIVED, onMessageReceived);
    APP.eventSource.on(APP.event_types.CHAT_COMPLETION_PROMPT_READY, onChatCompletionPromptReady);
    APP.eventSource.on(APP.event_types.CHAT_CHANGED, onChatChanged);
    APP.eventSource.on(APP.event_types.MESSAGE_EDITED, onMessageEdited);
    APP.eventSource.on(APP.event_types.MESSAGE_SWIPED, onMessageSwiped);
    APP.eventSource.on(APP.event_types.MESSAGE_DELETED, onChatChanged);

    console.log("______________________Nhớ plugin: Tải hoàn tất______________________");
});
