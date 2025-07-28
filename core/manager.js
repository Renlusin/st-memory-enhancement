import { TTable } from "./tTableManager.js";
import applicationFunctionManager from "../services/appFuncManager.js";
// Xóa tham chiếu hệ thống bảng cũ
import { consoleMessageToEditor } from "../scripts/settings/devConsole.js";
import { calculateStringHash, generateRandomNumber, generateRandomString, lazy, readonly, } from "../utils/utility.js";
import { defaultSettings } from "../data/pluginSetting.js";
import { Drag } from "../components/dragManager.js";
import { PopupMenu } from "../components/popupMenu.js";
import { buildSheetsByTemplates, convertOldTablesToNewSheets } from "../index.js";
import { getRelativePositionOfCurrentCode } from "../utils/codePathProcessing.js";
import { pushCodeToQueue } from "../components/_fotTest.js";
import { createProxy, createProxyWithUserSetting } from "../utils/codeProxy.js";
import { refreshTempView } from '../scripts/editor/tableTemplateEditView.js';
import { newPopupConfirm, PopupConfirm } from "../components/popupConfirm.js";
import { refreshContextView } from "../scripts/editor/chatSheetsDataView.js";
import { updateSystemMessageTableStatus } from "../scripts/renderer/tablePushToChat.js";
import {taskTiming} from "../utils/system.js";
import {updateSelectBySheetStatus} from "../scripts/editor/tableTemplateEditView.js";

let derivedData = {}

export const APP = applicationFunctionManager

/**
 * @description `USER` Trình quản lý dữ liệu người dùng
 * @description Trình quản lý này dùng để quản lý cài đặt, ngữ cảnh, lịch sử chat của người dùng, v.v.
 * @description Lưu ý, dữ liệu người dùng nên được truy cập qua các phương thức của trình quản lý này, không nên truy cập trực tiếp dữ liệu người dùng
 */
export const USER = {
    getSettings: () => APP.power_user,
    getExtensionSettings: () => APP.extension_settings,
    saveSettings: () => APP.saveSettings(),
    saveChat: () => APP.saveChat(),
    getContext: () => APP.getContext(),
    isSwipe:()=>
    {
        const chats = USER.getContext().chat
        const lastChat = chats[chats.length - 1];
        const isIncludeEndIndex = (!lastChat) || lastChat.is_user === true;
        if(isIncludeEndIndex) return {isSwipe: false}
        const {deep} = USER.getChatPiece()
        return {isSwipe: true, deep}
    },
    getChatPiece: (deep = 0, direction = 'up') => {
        const chat = APP.getContext().chat;
        if (!chat || chat.length === 0 || deep >= chat.length) return  {piece: null, deep: -1};
        let index = chat.length - 1 - deep
        while (chat[index].is_user === true) {
            if(direction === 'up')index--
            else index++
            if (!chat[index]) return {piece: null, deep: -1}; // Nếu không tìm thấy tin nhắn không phải của người dùng, thì trả về null
        }
        return {piece:chat[index], deep: index};
    },
    loadUserAllTemplates() {
        let templates = USER.getSettings().table_database_templates;
        if (!Array.isArray(templates)) {
            templates = [];
            USER.getSettings().table_database_templates = templates;
            USER.saveSettings();
        }
        console.log("Mẫu toàn cục", templates)
        return templates;
    },
    tableBaseSetting: createProxyWithUserSetting('muyoo_dataTable'),
    tableBaseDefaultSettings: { ...defaultSettings },
    IMPORTANT_USER_PRIVACY_DATA: createProxyWithUserSetting('IMPORTANT_USER_PRIVACY_DATA', true),
}


/**
 * @description `BASE` Trình quản lý dữ liệu cơ bản của cơ sở dữ liệu
 * @description Trình quản lý này cung cấp truy cập vào dữ liệu người dùng và mẫu của cơ sở dữ liệu, nhưng không cung cấp sửa đổi dữ liệu
 * @description Lưu ý, các hoạt động trên cơ sở dữ liệu nên được thực hiện qua `BASE.object()` để tạo instance `Sheet`, bất kỳ chỉnh sửa nào trên cơ sở dữ liệu đều không nên được phơi bày trực tiếp trong trình quản lý này
 */
export const BASE = {
    /**
     * @description `Sheet` Instance bảng dữ liệu
     * @description Instance này dùng để truy cập, sửa đổi, truy vấn dữ liệu trong cơ sở dữ liệu, v.v.
     * @description Lưu ý, bất kỳ hoạt động nào trên cơ sở dữ liệu đều nên được thực hiện qua instance này, không nên truy cập trực tiếp cơ sở dữ liệu
     */
    Sheet: TTable.Sheet,
    SheetTemplate: TTable.Template,
    refreshContextView: refreshContextView,
    refreshTempView: refreshTempView,
    updateSystemMessageTableStatus: updateSystemMessageTableStatus,
    get templates() {
        return USER.loadUserAllTemplates()
    },
    contextViewRefreshing: false,
    sheetsData: new Proxy({}, {
        get(_, target) {
            switch (target) {
                case 'all':

                case 'context':
                    if (!USER.getContext().chatMetadata) {
                        USER.getContext().chatMetadata = {};
                    }
                    if (!USER.getContext().chatMetadata.sheets) {
                        USER.getContext().chatMetadata.sheets = [];
                    }
                    return USER.getContext().chatMetadata.sheets;
                case 'global':

                case 'role':

                default:
                    throw new Error(`Mục tiêu sheetsData không xác định: ${target}`);
            }
        },
        set(_, target, value) {
            switch (target) {
                case 'context':
                    if (!USER.getContext().chatMetadata) {
                        USER.getContext().chatMetadata = {};
                    }
                    USER.getContext().chatMetadata.sheets = value;
                    return true;
                case 'all':
                case 'global':
                case 'role':
                default:
                    throw new Error(`Không thể đặt mục tiêu sheetsData: ${target}`);
            }
        }
    }),
    getChatSheets(process=()=> {}) {
        DERIVED.any.chatSheetMap = DERIVED.any.chatSheetMap || {}
        const sheets = []
        BASE.sheetsData.context.forEach(sheet => {
            if (!DERIVED.any.chatSheetMap[sheet.uid]) {
                const newSheet = new BASE.Sheet(sheet.uid)
                DERIVED.any.chatSheetMap[sheet.uid] = newSheet
            }
            process(DERIVED.any.chatSheetMap[sheet.uid])
            sheets.push(DERIVED.any.chatSheetMap[sheet.uid])
        })
        return sheets
    },
    getChatSheet(uid){
        const sheet = DERIVED.any.chatSheetMap[uid]
        if (!sheet) {
            if(!BASE.sheetsData.context.some(sheet => sheet.uid === uid)) return null
            const newSheet = new BASE.Sheet(uid)
            DERIVED.any.chatSheetMap[uid] = newSheet
            return newSheet
        }
        return sheet
    },
    createChatSheetByTemp(temp){
        DERIVED.any.chatSheetMap = DERIVED.any.chatSheetMap || {}
        const newSheet = new BASE.Sheet(temp);
        DERIVED.any.chatSheetMap[newSheet.uid] = newSheet
        return newSheet
    },
    createChatSheet(cols, rows){
        const newSheet = new BASE.Sheet();
        newSheet.createNewSheet(cols, rows, false);
        DERIVED.any.chatSheetMap[newSheet.uid] = newSheet
        return newSheet
    },
    createChatSheetByJson(json){
        const newSheet = new BASE.Sheet();
        newSheet.loadJson(json);
        DERIVED.any.chatSheetMap[newSheet.uid] = newSheet
        return newSheet
    },
    copyHashSheets(hashSheets) {
        const newHashSheet = {}
        for (const sheetUid in hashSheets) {
            const hashSheet = hashSheets[sheetUid];
            newHashSheet[sheetUid] = hashSheet.map(row => row.map(hash => hash));
        }
        return newHashSheet
    },
    applyJsonToChatSheets(json, type ="both") {
        const newSheets = Object.entries(json).map(([sheetUid, sheetData]) => {
            if(sheetUid === 'mate') return null
            const sheet = BASE.getChatSheet(sheetUid);
            if (sheet) {
                sheet.loadJson(sheetData)
                return sheet
            } else {
                if(type === 'data') return null
                else return BASE.createChatSheetByJson(sheetData)
            }
        }).filter(Boolean)
        if(type === 'data') return BASE.saveChatSheets()
        const oldSheets = BASE.getChatSheets().filter(sheet => !newSheets.some(newSheet => newSheet.uid === sheet.uid))
        oldSheets.forEach(sheet => sheet.enable = false)
        console.log("Áp dụng dữ liệu bảng", newSheets, oldSheets)
        const mergedSheets = [...newSheets, ...oldSheets]
        BASE.reSaveAllChatSheets(mergedSheets)
    },
    saveChatSheets(saveToPiece = true) {
        if(saveToPiece){
            const {piece} = USER.getChatPiece()
            if(!piece) return EDITOR.error("Không có vật chứa hồ sơ, bảng được lưu trong lịch sử chat, vui lòng chat ít nhất một vòng rồi thử lại")
            BASE.getChatSheets(sheet => sheet.save(piece, true))
        }else BASE.getChatSheets(sheet => sheet.save(undefined, true))
        USER.saveChat()
    },
    reSaveAllChatSheets(sheets) {
        BASE.sheetsData.context = []
        const {piece} = USER.getChatPiece()
        if(!piece) return EDITOR.error("Không có vật chứa hồ sơ, bảng được lưu trong lịch sử chat, vui lòng chat ít nhất một vòng rồi thử lại")
        sheets.forEach(sheet => {
            sheet.save(piece, true)
        })
        updateSelectBySheetStatus()
        BASE.refreshTempView(true)
        USER.saveChat()
    },
    updateSelectBySheetStatus(){
        updateSelectBySheetStatus()
    },
    getLastSheetsPiece(deep = 0, cutoff = 1000, deepStartAtLastest = true, direction = 'up') {
        console.log("Truy vấn dữ liệu bảng lên trên, độ sâu", deep, "Cắt đứt", cutoff, "Bắt đầu từ mới nhất", deepStartAtLastest)
        // Nếu không tìm thấy dữ liệu bảng của hệ thống mới, thì thử tìm dữ liệu bảng của hệ thống cũ (chế độ tương thích)
        const chat = APP.getContext().chat
        if (!chat || chat.length === 0 || chat.length <= deep) {
            return { deep: -1, piece: BASE.initHashSheet() }
        }
        const startIndex = deepStartAtLastest ? chat.length - deep - 1 : deep;
        for (let i = startIndex;
            direction === 'up' ? (i >= 0 && i >= startIndex - cutoff) : (i < chat.length && i < startIndex + cutoff);
            direction === 'up' ? i-- : i++) {
            if (chat[i].is_user === true) continue; // Bỏ qua tin nhắn người dùng
            if (chat[i].hash_sheets) {
                console.log("Truy vấn dữ liệu bảng lên trên, tìm thấy dữ liệu bảng", chat[i])
                return { deep: i, piece: chat[i] }
            }
            // Nếu không tìm thấy dữ liệu bảng của hệ thống mới, thì thử tìm dữ liệu bảng của hệ thống cũ (chế độ tương thích)
            // Lưu ý không còn sử dụng lớp Table cũ
            if (chat[i].dataTable) {
                // Để tương thích với hệ thống cũ, chuyển đổi dữ liệu cũ sang định dạng Sheet mới
                console.log("Tìm thấy dữ liệu bảng cũ", chat[i])
                convertOldTablesToNewSheets(chat[i].dataTable, chat[i])
                return { deep: i, piece: chat[i] }
            }
        }
        return { deep: -1, piece: BASE.initHashSheet() }
    },
    getReferencePiece(){
        const swipeInfo = USER.isSwipe()
        console.log("Lấy đoạn tham chiếu", swipeInfo)
        const {piece} = swipeInfo.isSwipe?swipeInfo.deep===-1?{piece:BASE.initHashSheet()}: BASE.getLastSheetsPiece(swipeInfo.deep-1,1000,false):BASE.getLastSheetsPiece()
        return piece
    },
    hashSheetsToSheets(hashSheets) {
        if (!hashSheets) {
            return [];
        }
        return BASE.getChatSheets((sheet)=>{
            if (hashSheets[sheet.uid]) {
                sheet.hashSheet = hashSheets[sheet.uid].map(row => row.map(hash => hash));
            }else sheet.initHashSheet()
        })
    },
    getLastestSheets(){
        const { piece, deep } = BASE.getLastSheetsPiece();
        if (!piece || !piece.hash_sheets) return
        return BASE.hashSheetsToSheets(piece.hash_sheets);
    },
    initHashSheet() {
        if (BASE.sheetsData.context.length === 0) {
            console.log("Thử xây dựng dữ liệu bảng từ mẫu")
            const {piece: currentPiece} = USER.getChatPiece()
            buildSheetsByTemplates(currentPiece)
            if (currentPiece?.hash_sheets) {
                // console.log('Sử dụng mẫu để tạo dữ liệu bảng mới', currentPiece)
                return currentPiece
            }
        }
        const hash_sheets = {}
        BASE.sheetsData.context.forEach(sheet => {
            hash_sheets[sheet.uid] = [sheet.hashSheet[0].map(hash => hash)]
        })
        return { hash_sheets }
    }
};


/**
 * @description `Editor` Bộ điều khiển trình chỉnh sửa
 * @description Bộ điều khiển này dùng để quản lý trạng thái, sự kiện, cài đặt của trình chỉnh sửa, bao gồm vị trí chuột, panel tập trung, panel hover, panel hoạt động, v.v.
 * @description Dữ liệu của trình chỉnh sửa nên độc lập tương đối so với dữ liệu khác, việc sửa đổi dữ liệu của trình chỉnh sửa sẽ không ảnh hưởng đến dữ liệu phái sinh và dữ liệu người dùng, và ngược lại
 * */
export const EDITOR = {
    Drag: Drag,
    PopupMenu: PopupMenu,
    Popup: APP.Popup,
    callGenericPopup: APP.callGenericPopup,
    POPUP_TYPE: APP.POPUP_TYPE,
    generateRaw: APP.generateRaw,
    getSlideToggleOptions: APP.getSlideToggleOptions,
    slideToggle: APP.slideToggle,
    confirm: newPopupConfirm,
    tryBlock: (cb, errorMsg, ...args) => {
        try {
            return cb(...args);
        } catch (e) {
            EDITOR.error(errorMsg ?? 'Thực thi khối mã thất bại', e.message, e);
            return null;
        }
    },
    info: (message, detail = '', timeout = 500) => consoleMessageToEditor.info(message, detail, timeout),
    success: (message, detail = '', timeout = 500) => consoleMessageToEditor.success(message, detail, timeout),
    warning: (message, detail = '', timeout = 2000) => consoleMessageToEditor.warning(message, detail, timeout),
    error: (message, detail = '', error, timeout = 2000) => consoleMessageToEditor.error(message, detail, error, timeout),
    clear: () => consoleMessageToEditor.clear(),
    logAll: () => {
        SYSTEM.codePathLog({
            'user_table_database_setting': USER.getSettings().muyoo_dataTable,
            'user_tableBase_templates': USER.getSettings().table_database_templates,
            'context': USER.getContext(),
            'context_chatMetadata_sheets': USER.getContext().chatMetadata?.sheets,
            'context_sheets_data': BASE.sheetsData.context,
            'chat_last_piece': USER.getChatPiece()?.piece,
            'chat_last_sheet': BASE.getLastSheetsPiece()?.piece.hash_sheets,
            'chat_last_old_table': BASE.getLastSheetsPiece()?.piece.dataTable,
        }, 3);
    },
}


/**
 * @description `DerivedData` Trình quản lý dữ liệu phái sinh của dự án
 * @description Trình quản lý này dùng để quản lý dữ liệu phái sinh thời gian chạy, bao gồm nhưng không giới hạn ở dữ liệu người dùng trung gian, dữ liệu hệ thống, dữ liệu cơ sở dữ liệu, v.v.
 * @description Lưu ý, dữ liệu nhạy cảm không thể sử dụng trình quản lý dữ liệu phái sinh này để lưu trữ hoặc chuyển tiếp
 * */
export const DERIVED = {
    get any() {
        return createProxy(derivedData);
    },
    // Xóa tham chiếu lớp Table cũ, sử dụng lớp Sheet và SheetTemplate mới
};


/**
 * @description `SYSTEM` Bộ điều khiển hệ thống
 * @description Bộ điều khiển này dùng để quản lý dữ liệu cấp hệ thống, sự kiện, cài đặt, v.v., bao gồm tải component, đọc viết file, ghi vị trí mã, v.v.
 */
export const SYSTEM = {
    getTemplate: (name) => {
        console.log('getTemplate', name);
        return APP.renderExtensionTemplateAsync('third-party/st-memory-enhancement/assets/templates', name);
    },

    codePathLog: function (context = '', deep = 2) {
        const r = getRelativePositionOfCurrentCode(deep);
        const rs = `${r.codeFileRelativePathWithRoot}[${r.codePositionInFile}] `;
        console.log(`%c${rs}${r.codeAbsolutePath}`, 'color: red', context);
    },
    lazy: lazy,
    generateRandomString: generateRandomString,
    generateRandomNumber: generateRandomNumber,
    calculateStringHash: calculateStringHash,

    // readFile: fileManager.readFile,
    // writeFile: fileManager.writeFile,

    taskTiming: taskTiming,
    f: (f, name) => pushCodeToQueue(f, name),
};
