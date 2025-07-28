import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../../core/manager.js';
import {getColumnLetter} from "../../core/table/utils.js";
// import { deleteRow, insertRow, updateRow } from "../oldTableActions.js";
// import JSON5 from '../../utils/json5.min.mjs'

const histories = `
<style>
.table-history {
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
    width: 100%;
    height: 100%;
    padding: 10px;
}
.table-history-content {
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
    overflow-y: auto;
}
.history-tabs {
    display: flex;
    overflow-x: auto;
    z-index: 999;
}

/* Hiển thị thanh cuộn của .history-tabs ở trên cùng */
.history-tabs::-webkit-scrollbar {

}

.history-tab {
    margin-right: 15px;
    cursor: pointer;
    border-radius: 5px 5px 0 0;
    padding: 0 5px;
    color: var(--SmartThemeBodyColor);
    white-space: nowrap;
    transition: background-color 0.3s;
}
.history-tab.active {
    color: var(--SmartThemeQuoteColor);
    background-color: rgba(100, 100, 255, 0.3);
    font-weight: bold;
}
.history-sheets-content {
    display: flex;
    flex: 1;
    flex-direction: column;
    width: 100%;
}
.history-sheet-container {
    display: none;
    border-radius: 5px;
    height: 100%;
}
.history-sheet-container.active {
    display: flex;
    flex: 1;
    border: 1px solid rgba(255, 255, 255, 0.2);
}
.history-cell-list {
    overflow-y: auto;
    width: 100%;
    /* Ngăn nội dung bị nhảy */
    will-change: transform;
    transform: translateZ(0);
}
.history-cell-item {
    display: flex;
    flex: 1;
    width: 100%;
    justify-content: space-between;
    margin-bottom: 5px;
    padding: 5px;
    background-color: rgba(0, 0, 0, 0.2);
    border-radius: 3px;
}
.history-cell-position {
    font-weight: bold;
    color: var(--SmartThemeQuoteColor);
    width: 60px;
}
.history-cell-value {
    display: flex;
    flex: 1;
    width: 100%;
    padding: 0 10px;
    font-weight: normal;
    word-break: break-word !important;
    overflow-wrap: break-word !important;
    white-space: normal !important;
    min-width: 150px !important; /* Đảm bảo đủ không gian */
    line-height: 1.4 !important; /* Tăng khoảng cách dòng */
}
.history-cell-timestamp {
    color: var(--SmartThemeEmColor);
    font-size: 0.9em;
    width: 60px;
    text-align: right;
}
.history-empty {
    font-style: italic;
    color: rgba(255, 255, 255, 0.5);
    text-align: center;
    padding: 10px;
}
</style>
<div class="table-history">
    <h3>Lịch sử ô bảng</h3>
    <div class="history-tabs">
        <!-- Tabs được tạo động -->
    </div>
    <div class="table-history-content">
        <div class="history-sheets-content">
            <!-- Nội dung lịch sử bảng được tạo động -->
        </div>
    </div>
</div>
`

function scrollToBottom(container) {
    // Cuộn xuống cuối sau khi hiển thị popup
    const contentContainer = $(container).find('.table-history-content');
    contentContainer.scrollTop(contentContainer[0].scrollHeight);
}

async function updateTableHistoryData(container) {
    const { piece, deep } = BASE.getLastSheetsPiece();
    const sheetsData = BASE.getChatSheets();
    if (!piece || !piece.hash_sheets) return;

    // Lấy container nội dung
    const contentContainer = $(container).find('.table-history-content');
    const tabsContainer = $(container).find('.history-tabs');
    const sheetsContainer = $(contentContainer).find('.history-sheets-content');

    // Xóa nội dung hiện tại
    tabsContainer.empty();
    sheetsContainer.empty();

    // Nếu không có dữ liệu bảng, hiển thị gợi ý
    if (!sheetsData || sheetsData.length === 0) {
        sheetsContainer.append('<div class="history-empty">Không có dữ liệu lịch sử để hiển thị</div>');
        return;
    }

    // Đếm số bảng hợp lệ (dùng để xử lý tab đầu tiên được kích hoạt)
    let validSheetCount = 0;

    // Duyệt qua tất cả các bảng
    sheetsData.forEach((sheetData, index) => {
        if (!sheetData.cellHistory || sheetData.cellHistory.length === 0) return;

        const sheetName = sheetData.name || `Bảng ${index + 1}`;
        const sheetId = `history-sheet-${index}`;
        validSheetCount++;

        // Tạo Tab
        const tab = $(`<div class="history-tab" data-target="${sheetId}">#${index} ${sheetName}</div>`);
        if (validSheetCount === 1) {
            tab.addClass('active');
        }
        tabsContainer.append(tab);

        // Tạo khu vực nội dung bảng
        const sheetContainer = $(`<div id="${sheetId}" class="history-sheet-container ${validSheetCount === 1 ? 'active' : ''}"></div>`);
        const cellListContainer = $('<div class="history-cell-list"></div>');

        // Đếm số lượng lịch sử hợp lệ
        let validHistoryCount = 0;

        sheetData.cellHistory.forEach(cell => {
            const cellInstance = sheetData.cells.get(cell.uid);
            const [rowIndex, colIndex] = cellInstance.position;
            // console.log(rowIndex, colIndex, cellInstance);

            // Chỉ hiển thị ô có giá trị
            if (!cell.data || !cell.data.value) return;

            // // Bỏ qua hàng đầu cột đầu (ô gốc của bảng)
            // if (rowIndex === 0 && colIndex === 0) return;

            // Tạo hiển thị vị trí
            const positionDisplay = () => {
                if (rowIndex === 0 && colIndex === 0) {
                    return `<span style="color: var(--SmartThemeEmColor);">Nguồn bảng</span>`;
                } else if (rowIndex === 0) {
                    return `Cột <span style="color: var(--SmartThemeQuoteColor);">${colIndex}</span>`;
                } else if (colIndex === 0) {
                    return `Hàng <span style="color: var(--SmartThemeQuoteColor);">${rowIndex}</span>`;
                } else if (rowIndex > 0 && colIndex > 0) {
                    return `<span style="color: #4C8BF5;">${getColumnLetter(colIndex-1)}</span><span style="color: #34A853;">${rowIndex}</span>`;
                }
                return '<span style="color: #EA4335;">Dữ liệu cũ</span>';
            }

            // Tạo mục lịch sử
            const historyItem = $('<div class="history-cell-item"></div>');
            const positionElement = $(`<div class="history-cell-position">${positionDisplay()}</div>`);
            const valueElement = $(`<div class="history-cell-value">${cell.data.value}</div>`);
            const timestampElement = $(`<div class="history-cell-timestamp">${cell.uid.slice(-4)}</div>`);

            historyItem.append(positionElement);
            historyItem.append(valueElement);
            // historyItem.append(timestampElement);

            cellListContainer.append(historyItem);
            validHistoryCount++;
        });

        // Nếu không có mục lịch sử, hiển thị gợi ý
        if (validHistoryCount === 0) {
            cellListContainer.append('<div class="history-empty">Bảng này không có dữ liệu lịch sử</div>');
        }

        sheetContainer.append(cellListContainer);
        sheetsContainer.append(sheetContainer);
    });

    // Nếu không có bảng nào có dữ liệu lịch sử, hiển thị gợi ý
    if (validSheetCount === 0) {
        sheetsContainer.append('<div class="history-empty">Không có dữ liệu lịch sử để hiển thị</div>');
    }

    // Thêm sự kiện chuyển tab
    tabsContainer.find('.history-tab').on('click', function() {
        // Xóa trạng thái hoạt động của tất cả tab
        tabsContainer.find('.history-tab').removeClass('active');
        sheetsContainer.find('.history-sheet-container').removeClass('active');

        // Thêm trạng thái hoạt động cho tab hiện tại
        $(this).addClass('active');
        const targetId = $(this).data('target');
        $(`#${targetId}`).addClass('active');

        // Cuộn khu vực nội dung xuống cuối
        scrollToBottom(container);
    });
}

/**
 * Mở cửa sổ bật lên lịch sử chỉnh sửa bảng
 */
export async function openTableHistoryPopup(){
    const tableHistoryPopup = new EDITOR.Popup(histories, EDITOR.POPUP_TYPE.TEXT, '', { large: true, wide: true, allowVerticalScrolling: false });
    const historyContainer = $(tableHistoryPopup.dlg)[0];

    updateTableHistoryData(historyContainer);
    tableHistoryPopup.show();
}
