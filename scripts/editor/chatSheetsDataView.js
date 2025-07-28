import { BASE, DERIVED, EDITOR, SYSTEM, USER } from '../../core/manager.js';
import { updateSystemMessageTableStatus } from "../renderer/tablePushToChat.js";
import { findNextChatWhitTableData, undoSheets } from "../../index.js";
import { rebuildSheets } from "../runtime/absoluteRefresh.js";
import { openTableHistoryPopup } from "./tableHistory.js";
import { PopupMenu } from "../../components/popupMenu.js";
import { openTableStatisticsPopup } from "./tableStatistics.js";
import { openCellHistoryPopup } from "./cellHistory.js";
import { openSheetStyleRendererPopup } from "./sheetStyleEditor.js";
import { Cell } from "../../core/table/cell.js";

let tablePopup = null
let copyTableData = null
let selectedCell = null
let editModeSelectedRows = []
let viewSheetsContainer = null
let lastCellsHashSheet = null
const userTableEditInfo = {
    chatIndex: null,
    editAble: false,
    tables: null,
    tableIndex: null,
    rowIndex: null,
    colIndex: null,
}

/**
 * Sao chép bảng
 * @param {*} tables Dữ liệu của tất cả các bảng
 */
export async function copyTable() {
    copyTableData = JSON.stringify(getTableJson({type:'chatSheets', version: 1}))
    if(!copyTableData) return
    $('#table_drawer_icon').click()

    EDITOR.confirm(`Đang sao chép dữ liệu bảng (#${SYSTEM.generateRandomString(4)})`, 'Hủy', 'Dán vào hội thoại hiện tại').then(async (r) => {
        if (r) {
            await pasteTable()
        }
        if ($('#table_drawer_icon').hasClass('closedIcon')) {
            $('#table_drawer_icon').click()
        }
    })
}

/**
 * Dán bảng
 * @param {number} mesId ID của tin nhắn cần dán bảng vào
 * @param {Element} viewSheetsContainer DOM của container bảng
 */
async function pasteTable() {
    if (USER.getContext().chat.length === 0) {
        EDITOR.error("Không có vật chứa hồ sơ, bảng được lưu trong lịch sử chat, vui lòng chat ít nhất một vòng rồi thử lại")
        return
    }
    const confirmation = await EDITOR.callGenericPopup('Dán sẽ xóa dữ liệu bảng hiện có, bạn có muốn tiếp tục không?', EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "Tiếp tục", cancelButton: "Hủy" });
    if (confirmation) {
        if (copyTableData) {
            const tables = JSON.parse(copyTableData)
            if(!tables.mate === 'chatSheets')  return EDITOR.error("Nhập thất bại: Định dạng file không đúng")
            BASE.applyJsonToChatSheets(tables)
            await renderSheetsDOM()
            EDITOR.success('Dán thành công')
        } else {
            EDITOR.error("Dán thất bại: Không có dữ liệu bảng trong clipboard")
        }
    }
}

/**
 * Nhập bảng
 * @param {number} mesId ID của tin nhắn cần nhập bảng
 */
async function importTable(mesId, viewSheetsContainer) {
    if (mesId === -1) {
        EDITOR.error("Không có vật chứa hồ sơ, bảng được lưu trong lịch sử chat, vui lòng chat ít nhất một vòng rồi thử lại")
        return
    }

    // 1. Tạo một phần tử input, đặt type là 'file' để chọn file
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    // Đặt thuộc tính accept để giới hạn chỉ chọn file JSON, cải thiện trải nghiệm người dùng
    fileInput.accept = '.json';

    // 2. Thêm trình nghe sự kiện để theo dõi thay đổi khi chọn file (sự kiện change)
    fileInput.addEventListener('change', function (event) {
        // Lấy danh sách file được chọn (đối tượng FileList)
        const files = event.target.files;

        // Kiểm tra xem có file được chọn không
        if (files && files.length > 0) {
            // Lấy file đầu tiên được chọn (giả sử chỉ chọn một file JSON)
            const file = files[0];

            // 3. Tạo đối tượng FileReader để đọc nội dung file
            const reader = new FileReader();

            // 4. Định nghĩa hàm xử lý sự kiện onload của FileReader
            // Sự kiện onload được kích hoạt khi file được đọc thành công
            reader.onload = async function (loadEvent) {
                const button = { text: 'Nhập mẫu và dữ liệu', result: 3 }
                const popup = new EDITOR.Popup("Vui lòng chọn phần cần nhập", EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "Nhập mẫu và dữ liệu", cancelButton: "Hủy"});
                const result = await popup.show()
                if (result) {
                        const tables = JSON.parse(loadEvent.target.result)
                        console.log("Nội dung nhập", tables, tables.mate, !(tables.mate === 'chatSheets'))
                        if(!(tables.mate?.type === 'chatSheets'))  return EDITOR.error("Nhập thất bại: Định dạng file không đúng", "Vui lòng kiểm tra xem file bạn nhập có phải là dữ liệu bảng không")
                        if(result === 3)
                            BASE.applyJsonToChatSheets(tables, "data")
                        else
                            BASE.applyJsonToChatSheets(tables)
                        await renderSheetsDOM()
                        EDITOR.success('Nhập thành công')
                }
            };
            reader.readAsText(file, 'UTF-8'); // Đề xuất chỉ định mã hóa UTF-8 để đảm bảo đọc đúng các ký tự tiếng Việt, v.v.
        }
    });
    fileInput.click();
}

/**
 * Xuất bảng
 * @param {Array} tables Dữ liệu của tất cả các bảng
 */
async function exportTable() {
    const jsonTables = getTableJson({type:'chatSheets', version: 1})
    if(!jsonTables) return
    const bom = '\uFEFF';
    const blob = new Blob([bom + JSON.stringify(jsonTables)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = 'table_data.json'; // Tên file mặc định
    document.body.appendChild(downloadLink); // Phải thêm vào DOM để kích hoạt tải xuống
    downloadLink.click();
    document.body.removeChild(downloadLink); // Xóa sau khi tải xong

    URL.revokeObjectURL(url); // Giải phóng đối tượng URL

    EDITOR.success('Đã xuất');
}

/**
 * Lấy dữ liệu JSON của bảng
 */
function getTableJson(mate) {
    if (!DERIVED.any.renderingSheets || DERIVED.any.renderingSheets.length === 0) {
        EDITOR.warning('Bảng hiện tại không có dữ liệu, không thể xuất');
        return;
    }
    const sheets = DERIVED.any.renderingSheets.filter(sheet => sheet.enable)
    // const csvTables = sheets.map(sheet => "SHEET-START" + sheet.uid + "\n" + sheet.getSheetCSV(false) + "SHEET-END").join('\n')
    const jsonTables = {}
    sheets.forEach(sheet => {
        jsonTables[sheet.uid] = sheet.getJson()
    })
    jsonTables.mate = mate
    return jsonTables
}

/**
 * Xóa bảng
 * @param {number} mesId ID của tin nhắn cần xóa bảng
 * @param {Element} viewSheetsContainer DOM của container bảng
 */
async function clearTable(mesId, viewSheetsContainer) {
    if (mesId === -1) return
    const confirmation = await EDITOR.callGenericPopup('Xóa tất cả dữ liệu bảng của hội thoại hiện tại và đặt lại lịch sử, thao tác này không thể hoàn tác, bạn có muốn tiếp tục không?', EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "Tiếp tục", cancelButton: "Hủy" });
    if (confirmation) {
        await USER.getContext().chat.forEach((piece => {
            if (piece.hash_sheets) {
                delete piece.hash_sheets
            }
            if (piece.dataTable) delete piece.dataTable
        }))
        setTimeout(() => {
            USER.saveSettings()
            USER.saveChat();
            refreshContextView()
            EDITOR.success("Dữ liệu bảng đã được xóa thành công")
            console.log("Đã xóa dữ liệu bảng")
        }, 100)
    }
}

/**
 * Đặt gợi ý chỉnh sửa bảng
 * @param {Element} tableEditTips DOM của gợi ý chỉnh sửa bảng
 */
function setTableEditTips(tableEditTips) {
    /* if (!tableEditTips || tableEditTips.length === 0) {
        console.error('tableEditTips là null hoặc là đối tượng jQuery rỗng');
        return;
    }
    const tips = $(tableEditTips); // Đảm bảo tableEditTips là đối tượng jQuery
    tips.empty();
    if (USER.tableBaseSetting.isExtensionAble === false) {
        tips.append('Hiện tại plugin đã bị tắt, sẽ không yêu cầu AI cập nhật bảng.');
        tips.css("color", "rgb(211 39 39)");
    } else if (userTableEditInfo.editAble) {
        tips.append('Nhấp vào ô để chọn thao tác chỉnh sửa. Ô màu xanh lá là ô được chèn trong vòng này, ô màu xanh dương là ô được sửa đổi trong vòng này.');
        tips.css("color", "lightgreen");
    } else {
        tips.append('Bảng này là bảng trung gian, để tránh nhầm lẫn, không thể chỉnh sửa hoặc dán. Bạn có thể mở bảng của tin nhắn mới nhất để chỉnh sửa');
        tips.css("color", "lightyellow");
    } */
}

async function cellDataEdit(cell) {
    const result = await EDITOR.callGenericPopup("Chỉnh sửa ô", EDITOR.POPUP_TYPE.INPUT, cell.data.value, { rows: 3 })
    if (result) {
        cell.editCellData({ value: result })
        refreshContextView();
        if(cell.type === Cell.CellType.column_header) BASE.refreshTempView(true)
    }
}

async function columnDataEdit(cell) {
    const columnEditor = `
<div class="column-editor">
    <div class="column-editor-header">
        <h3>Chỉnh sửa dữ liệu cột</h3>
    </div>
    <div class="column-editor-body">
        <div class="column-editor-content">
            <label for="column-editor-input">Dữ liệu cột:</label>
            <textarea id="column-editor-input" rows="5"></textarea>
        </div>
    </div>
</div>
`
    const columnCellDataPopup = new EDITOR.Popup(columnEditor, EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "Áp dụng thay đổi", cancelButton: "Hủy" });
    const historyContainer = $(columnCellDataPopup.dlg)[0];

    await columnCellDataPopup.show();

    if (columnCellDataPopup.result) {
        // cell.editCellData({ value: result })
        refreshContextView();
    }
}

function batchEditMode(cell) {
    DERIVED.any.batchEditMode = true;
    DERIVED.any.batchEditModeSheet = cell.parent;
    EDITOR.confirm(`Đang chỉnh sửa hàng của #${cell.parent.name}`, 'Hủy', 'Hoàn tất').then((r) => {
        DERIVED.any.batchEditMode = false;
        DERIVED.any.batchEditModeSheet = null;
        renderSheetsDOM();
    })
    renderSheetsDOM();
}

// Hàm xử lý sự kiện mới
export function cellClickEditModeEvent(cell) {
    cell.element.style.cursor = 'pointer'
    if (cell.type === Cell.CellType.row_header) {
        cell.element.textContent = ''

        // Thêm ba div vào cell.element: một để hiển thị thứ tự, một cho nút khóa, và một cho nút xóa
        const containerDiv = $(`<div class="flex-container" style="display: flex; flex-direction: row; justify-content: space-between; width: 100%;"></div>`)
        const rightDiv = $(`<div class="flex-container" style="margin-right: 3px"></div>`)
        const indexDiv = $(`<span class="menu_button_icon interactable" style="margin: 0; padding: 0 6px; cursor: move; color: var(--SmartThemeBodyColor)">${cell.position[0]}</span>`)
        const lockDiv = $(`<div><i class="menu_button menu_button_icon interactable fa fa-lock" style="margin: 0; border: none; color: var(--SmartThemeEmColor)"></i></div>`)
        const deleteDiv = $(`<div><i class="menu_button menu_button_icon interactable fa fa-xmark redWarningBG" style="margin: 0; border: none; color: var(--SmartThemeEmColor)"></i></div>`)

        $(lockDiv).on('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (cell._pre_deletion) return

            cell.parent.hashSheet.forEach(row => {
                if (row[0] === cell.uid) {
                    row.forEach((hash) => {
                        const target = cell.parent.cells.get(hash)
                        target.locked = !target.locked
                        target.element.style.backgroundColor = target.locked ? '#00ff0022' : ''
                    })
                }
            })
        })
        $(deleteDiv).on('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            handleAction(cell, Cell.CellAction.deleteSelfRow)
            //if (cell.locked) return

            /* cell.parent.hashSheet.forEach(row => {
                if (row[0] === cell.uid) {
                    row.forEach((hash) => {
                        const target = cell.parent.cells.get(hash)
                        target._pre_deletion = !target._pre_deletion
                        target.element.style.backgroundColor = target._pre_deletion ? '#ff000044' : ''
                    })
                }
            }) */
        })

        $(rightDiv).append(deleteDiv)
        $(containerDiv).append(indexDiv).append(rightDiv)
        $(cell.element).append(containerDiv)

    } else if (cell.type === Cell.CellType.cell) {
        cell.element.style.cursor = 'text'
        cell.element.contentEditable = true
        cell.element.focus()
        cell.element.addEventListener('blur', (e) => {
            e.stopPropagation();
            e.preventDefault();
            cell.data.value = cell.element.textContent.trim()
        })
    }

    cell.on('click', async (event) => {
        event.stopPropagation();
        event.preventDefault();
    })
}

async function confirmAction(event, text = 'Bạn có muốn tiếp tục thao tác này không?') {
    const confirmation = new EDITOR.Popup(text, EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "Tiếp tục", cancelButton: "Hủy" });

    await confirmation.show();
    if (!confirmation.result) return { filterData: null, confirmation: false };
    event()
}

/**
 * Tô sáng ô
 */
export function cellHighlight(sheet) {
    if(!lastCellsHashSheet) return;
    const lastHashSheet = lastCellsHashSheet[sheet.uid] || []
    if ((sheet.hashSheet.length < 2) && (lastHashSheet.length < 2)) return;    // Khi nội dung bảng trống, không thực thi các hàm tiếp theo để tăng tính mạnh mẽ
    const hashSheetFlat = sheet.hashSheet.flat()
    const lastHashSheetFlat = lastHashSheet.flat()
    let deleteRow = []
    lastHashSheet.forEach((row, index) => {
        if (!hashSheetFlat.includes(row[0])) {
            deleteRow.push(row[0])
            sheet.hashSheet.splice(index,0,lastHashSheet[index])
        }
    })

    const changeSheet = sheet.hashSheet.map((row) => {
        const isNewRow = !lastHashSheetFlat.includes(row[0])
        const isDeletedRow = deleteRow.includes(row[0])
        return row.map((hash) => {
            if (isNewRow) return { hash, type: "newRow" }
            if (isDeletedRow) return { hash, type: "deletedRow" }
            if (!lastHashSheetFlat.includes(hash)) return { hash, type: "update" }
            return { hash, type: "keep" }
        })
    })
    changeSheet.forEach((row, index) => {
        if (index === 0)
            return
        let isKeepAll = true
        row.forEach((cell) => {
            let sheetCell = sheet.cells.get(cell.hash)
            const cellElement = sheetCell.element
            if (cell.type === "newRow") {
                cellElement.classList.add('insert-item')
                isKeepAll = false
            } else if (cell.type === "update") {
                cellElement.classList.add('update-item')
                isKeepAll = false
            } else if (cell.type === "deletedRow") {
                sheetCell.isDeleted = true
                cellElement.classList.add('delete-item')
                isKeepAll = false
            } else if (sheetCell.isDeleted === true) {
                cellElement.classList.add('delete-item')
                isKeepAll = false
            } else {
                cellElement.classList.add('keep-item')
            }
        })
        if (isKeepAll) {
            row.forEach((cell) => {
                const cellElement = sheet.cells.get(cell.hash).element
                cellElement.classList.add('keep-all-item')
            })
        }
    })
}

async function cellHistoryView(cell) {
    await openCellHistoryPopup(cell)
}

/**
 * Sự kiện tùy chỉnh kiểu bảng
 * @param {*} cell
 */
async function customSheetStyle(cell) {
    await openSheetStyleRendererPopup(cell.parent)
    await refreshContextView();
}

function cellClickEvent(cell) {
    cell.element.style.cursor = 'pointer'

    // Xác định xem có cần tô sáng dựa trên dữ liệu lịch sử không
    /* const lastCellUid = lastCellsHashSheet.has(cell.uid)
    if (!lastCellUid) {
        cell.element.style.backgroundColor = '#00ff0011'
    }
    else if (cell.parent.cells.get(lastCellUid).data.value !== cell.data.value) {
        cell.element.style.backgroundColor = '#0000ff11'
    } */

    cell.on('click', async (event) => {
        event.stopPropagation();
        event.preventDefault();

        // Lấy lại hash
        BASE.getLastestSheets()

        if (cell.parent.currentPopupMenu) {
            cell.parent.currentPopupMenu.destroy();
            cell.parent.currentPopupMenu = null;
        }
        cell.parent.currentPopupMenu = new PopupMenu();

        const menu = cell.parent.currentPopupMenu;
        const [rowIndex, colIndex] = cell.position;
        const sheetType = cell.parent.type;

        if (rowIndex === 0 && colIndex === 0) {
            menu.add('<i class="fa-solid fa-bars-staggered"></i> Chỉnh sửa hàng loạt', () => batchEditMode(cell));
            menu.add('<i class="fa fa-arrow-right"></i> Chèn cột bên phải', () => handleAction(cell, Cell.CellAction.insertRightColumn));
            menu.add('<i class="fa fa-arrow-down"></i> Chèn hàng bên dưới', () => handleAction(cell, Cell.CellAction.insertDownRow));
            menu.add('<i class="fa-solid fa-wand-magic-sparkles"></i> Tùy chỉnh kiểu bảng', async () => customSheetStyle(cell));
        } else if (colIndex === 0) {
            menu.add('<i class="fa-solid fa-bars-staggered"></i> Chỉnh sửa hàng loạt', () => batchEditMode(cell));
            menu.add('<i class="fa fa-arrow-up"></i> Chèn hàng bên trên', () => handleAction(cell, Cell.CellAction.insertUpRow));
            menu.add('<i class="fa fa-arrow-down"></i> Chèn hàng bên dưới', () => handleAction(cell, Cell.CellAction.insertDownRow));
            menu.add('<i class="fa fa-trash-alt"></i> Xóa hàng', () => handleAction(cell, Cell.CellAction.deleteSelfRow), menu.ItemType.warning)
        } else if (rowIndex === 0) {
            menu.add('<i class="fa fa-i-cursor"></i> Chỉnh sửa cột này', async () => await cellDataEdit(cell));
            menu.add('<i class="fa fa-arrow-left"></i> Chèn cột bên trái', () => handleAction(cell, Cell.CellAction.insertLeftColumn));
            menu.add('<i class="fa fa-arrow-right"></i> Chèn cột bên phải', () => handleAction(cell, Cell.CellAction.insertRightColumn));
            menu.add('<i class="fa fa-trash-alt"></i> Xóa cột', () => confirmAction(() => { handleAction(cell, Cell.CellAction.deleteSelfColumn) }, 'Xác nhận xóa cột?'), menu.ItemType.warning);
        } else {
            menu.add('<i class="fa fa-i-cursor"></i> Chỉnh sửa ô này', async () => await cellDataEdit(cell));
            menu.add('<i class="fa-solid fa-clock-rotate-left"></i> Lịch sử ô', async () => await cellHistoryView(cell));
        }

        // Một số thao tác phái sinh không mang tính chức năng sau khi thiết lập menu bật lên, phải sử dụng setTimeout để đảm bảo menu hiển thị đúng
        setTimeout(() => {

        }, 0)

        const element = event.target

        // Sao lưu style hiện tại của ô để khôi phục khi menu đóng
        const style = element.style.cssText;

        // Lấy vị trí ô
        const rect = element.getBoundingClientRect();
        const tableRect = viewSheetsContainer.getBoundingClientRect();

        // Tính toán vị trí menu (tương đối với container bảng)
        const menuLeft = rect.left - tableRect.left;
        const menuTop = rect.bottom - tableRect.top;
        const menuElement = menu.renderMenu();
        $(viewSheetsContainer).append(menuElement);

        // Tô sáng ô
        element.style.backgroundColor = 'var(--SmartThemeUserMesBlurTintColor)';
        element.style.color = 'var(--SmartThemeQuoteColor)';
        element.style.outline = '1px solid var(--SmartThemeQuoteColor)';
        element.style.zIndex = '999';

        menu.show(menuLeft, menuTop).then(() => {
            element.style.cssText = style;
        })
        menu.frameUpdate((menu) => {
            // Định vị lại menu
            const rect = element.getBoundingClientRect();
            const tableRect = viewSheetsContainer.getBoundingClientRect();

            // Tính toán vị trí menu (tương đối với container bảng)
            const menuLeft = rect.left - tableRect.left;
            const menuTop = rect.bottom - tableRect.top;
            menu.popupContainer.style.left = `${menuLeft}px`;
            menu.popupContainer.style.top = `${menuTop + 3}px`;
        })
    })
    cell.on('', () => {
        console.log('Ô đã thay đổi:', cell)
    })
}

export async function renderEditableSheetsDOM(_sheets, _viewSheetsContainer, _cellClickEvent = cellClickEvent) {
    for (let [index, sheet] of _sheets.entries()) {
        if (!sheet.enable) continue
        const instance = sheet
        console.log("Đang render:", instance)
        const sheetContainer = document.createElement('div')
        const sheetTitleText = document.createElement('h3')
        sheetContainer.style.overflowX = 'none'
        sheetContainer.style.overflowY = 'auto'
        sheetTitleText.innerText = `#${index} ${sheet.name}`

        let sheetElement = null

        if (DERIVED.any.batchEditMode === true) {
            if (DERIVED.any.batchEditModeSheet?.name === instance.name) {
                sheetElement = await instance.renderSheet(cellClickEditModeEvent)
            } else {
                sheetElement = await instance.renderSheet((cell) => {
                    cell.element.style.cursor = 'default'
                })
                sheetElement.style.cursor = 'default'
                sheetElement.style.opacity = '0.5'
                sheetTitleText.style.opacity = '0.5'
            }
        } else {
            sheetElement = await instance.renderSheet(_cellClickEvent)
        }
        cellHighlight(instance)
        console.log("Render bảng:", sheetElement)
        $(sheetContainer).append(sheetElement)

        $(_viewSheetsContainer).append(sheetTitleText)
        $(_viewSheetsContainer).append(sheetContainer)
        $(_viewSheetsContainer).append(`<hr>`)
    }
}

/**
 * Khôi phục bảng
 * @param {number} mesId ID của tin nhắn cần xóa bảng
 * @param {Element} tableContainer DOM của container bảng
 */
async function undoTable(mesId, tableContainer) {
    if (mesId === -1) return
    //const button = { text: 'Hoàn tác 10 vòng', result: 3 }
    const popup = new EDITOR.Popup("Hoàn tác tất cả các chỉnh sửa thủ công và dữ liệu tái tổ chức trong số vòng được chỉ định, khôi phục bảng", EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "Hoàn tác vòng này", cancelButton: "Hủy" });
    const result = await popup.show()
    if (result) {
        await undoSheets(0)
        EDITOR.success('Khôi phục thành công')
    }
}

async function renderSheetsDOM(mesId = -1) {
    const task = new SYSTEM.taskTiming('renderSheetsDOM_task')
    DERIVED.any.renderingMesId = mesId
    updateSystemMessageTableStatus();
    task.log()
    const {deep: lastestDeep, piece: lastestPiece} = BASE.getLastSheetsPiece()
    const { piece, deep } = mesId === -1 ? {piece:lastestPiece, deep: lastestDeep} : {piece:USER.getContext().chat[mesId], deep: mesId}
    if (!piece || !piece.hash_sheets) return;

    if( deep === lastestDeep) DERIVED.any.isRenderLastest = true;
    else DERIVED.any.isRenderLastest = false;
    DERIVED.any.renderDeep = deep;

    const sheets = BASE.hashSheetsToSheets(piece.hash_sheets);
    sheets.forEach((sheet) => {
        sheet.hashSheet = sheet.hashSheet.filter((row) => {
            return (sheet.cells.get(row[0]).isDeleted !== true);
        })
        sheet.cells.forEach((cell) => {
            cell.isDeleted = false;
        })
    })
    console.log('renderSheetsDOM:', piece, sheets)
    DERIVED.any.renderingSheets = sheets
    task.log()
    // Dùng để ghi lại hash_sheets trước đó, khi render sẽ tô sáng dựa trên hash_sheets trước đó
    if(deep != 0) {
        lastCellsHashSheet = BASE.getLastSheetsPiece(deep - 1, 3, false)?.piece.hash_sheets;
        if (lastCellsHashSheet) {
            lastCellsHashSheet = BASE.copyHashSheets(lastCellsHashSheet)
        }
    }
    
    task.log()
    $(viewSheetsContainer).empty()
    viewSheetsContainer.style.paddingBottom = '150px'
    renderEditableSheetsDOM(sheets, viewSheetsContainer,DERIVED.any.isRenderLastest?undefined:()=>{})
    $("#table_indicator").text(DERIVED.any.isRenderLastest ? "Hiện tại là bảng hoạt động có thể chỉnh sửa" : `Hiện tại là bảng cũ trong vòng hội thoại thứ ${deep}, không thể chỉnh sửa`)
    task.log()
}

let initializedTableView = null
async function initTableView(mesId) {
    initializedTableView = $(await SYSTEM.getTemplate('manager')).get(0);
    viewSheetsContainer = initializedTableView.querySelector('#tableContainer');
    // setTableEditTips($(initializedTableView).find('#tableEditTips'));    // Đảm bảo tìm tableEditTips trong trường hợp table_manager_container tồn tại

    // Thiết lập gợi ý chỉnh sửa
    // Nhấp để mở xem thống kê dữ liệu bảng
    $(document).on('click', '#table_data_statistics_button', function () {
        EDITOR.tryBlock(openTableStatisticsPopup, "Mở thống kê bảng thất bại")
    })
    // Nhấp để mở nút xem lịch sử bảng
    $(document).on('click', '#dataTable_history_button', function () {
        EDITOR.tryBlock(openTableHistoryPopup, "Mở lịch sử bảng thất bại")
    })
    // Nhấp vào nút xóa bảng
    $(document).on('click', '#clear_table_button', function () {
        EDITOR.tryBlock(clearTable, "Xóa bảng thất bại", userTableEditInfo.chatIndex, viewSheetsContainer);
    })
    $(document).on('click', '#table_rebuild_button', function () {
        EDITOR.tryBlock(rebuildSheets, "Tái xây dựng bảng thất bại");
    })
    // Nhấp vào nút chỉnh sửa bảng
    $(document).on('click', '#table_edit_mode_button', function () {
        // openTableEditorPopup();
    })
    // Nhấp vào nút khôi phục bảng
    $(document).on('click', '#table_undo', function () {
        EDITOR.tryBlock(undoTable, "Khôi phục bảng thất bại");
    })
    // Nhấp vào nút sao chép bảng
    $(document).on('click', '#copy_table_button', function () {
        EDITOR.tryBlock(copyTable, "Sao chép bảng thất bại");
    })
    // Nhấp vào nút nhập bảng
    $(document).on('click', '#import_table_button', function () {
        EDITOR.tryBlock(importTable, "Nhập bảng thất bại", userTableEditInfo.chatIndex, viewSheetsContainer);
    })
    // Nhấp vào nút xuất bảng
    $(document).on('click', '#export_table_button', function () {
        EDITOR.tryBlock(exportTable, "Xuất bảng thất bại");
    })
    // Nhấp vào nút bảng trước
    $(document).on('click', '#table_prev_button', function () {
        const deep = DERIVED.any.renderDeep;
        const { deep: prevDeep }  = BASE.getLastSheetsPiece(deep - 1, 20, false);
        if (prevDeep === -1) {
            EDITOR.error("Không còn dữ liệu bảng nào nữa")
            return
        }
        renderSheetsDOM(prevDeep);
    })

    // Nhấp vào nút bảng sau
    $(document).on('click', '#table_next_button', function () {
        const deep = DERIVED.any.renderDeep;
        console.log("Độ sâu hiện tại:", deep)
        const { deep: nextDeep }  = BASE.getLastSheetsPiece(deep + 1, 20, false, "down");
        if (nextDeep === -1) {
            EDITOR.error("Không còn dữ liệu bảng nào nữa")
            return
        }
        renderSheetsDOM(nextDeep);
    })

    return initializedTableView;
}

export async function refreshContextView(mesId = -1) {
    if(BASE.contextViewRefreshing) return
    BASE.contextViewRefreshing = true
    await renderSheetsDOM(mesId);
    console.log("Làm mới giao diện bảng")
    BASE.contextViewRefreshing = false
}

export async function getChatSheetsView(mesId = -1) {
    // Nếu đã khởi tạo, trả về container được lưu trong bộ nhớ cache, tránh tạo lại
    if (initializedTableView) {
        // Cập nhật nội dung bảng, nhưng không tạo lại toàn bộ container
        await renderSheetsDOM();
        return initializedTableView;
    }
    return await initTableView(mesId);
}
