// tableTemplateEditView.js
import { BASE, DERIVED, EDITOR, SYSTEM, USER } from '../../core/manager.js';
import { PopupMenu } from '../../components/popupMenu.js';
import { Form } from '../../components/formManager.js';
import { openSheetStyleRendererPopup } from "./sheetStyleEditor.js";
import { compareDataDiff } from "../../utils/utility.js";
import {SheetBase} from "../../core/table/base.js"
import { Cell } from '../../core/table/cell.js';

let drag = null;
let currentPopupMenu = null;
let dropdownElement = null;
const renderedTables = new Map();
let scope = 'chat'

const formConfigs = {
    sheet_origin: {
        formTitle: "Chỉnh sửa bảng",
        formDescription: "Cài đặt tổng thể cho một bảng đơn.",
        fields: [

        ]
    },
    column_header: {
        formTitle: "Chỉnh sửa cột",
        formDescription: "Cài đặt tiêu đề và thông tin mô tả cho cột.",
        fields: [
            { label: 'Tiêu đề cột', type: 'text', dataKey: 'value' },
            { label: 'Không cho phép giá trị trùng lặp', type: 'checkbox', dataKey: 'valueIsOnly' },
            {
                label: 'Kiểu dữ liệu', type: 'select', dataKey: 'columnDataType',
                options: [
                    { value: 'text', text: 'Văn bản' },
                    // { value: 'number', text: 'Số' },
                    // { value: 'option', text: 'Lựa chọn' },
                ]
            },
            { label: 'Mô tả cột', description: '', type: 'textarea', rows: 4, dataKey: 'columnNote' },
        ],
    },
    row_header: {
        formTitle: "Chỉnh sửa hàng",
        formDescription: "Cài đặt tiêu đề và thông tin mô tả cho hàng.",
        fields: [
            { label: 'Tiêu đề hàng', type: 'text', dataKey: 'value' },
            { label: 'Mô tả hàng', description: '(Giải thích cho AI về vai trò của hàng này)', type: 'textarea', rows: 4, dataKey: 'rowNote' },
        ],
    },
    cell: {
        formTitle: "Chỉnh sửa ô",
        formDescription: "Chỉnh sửa nội dung cụ thể của ô.",
        fields: [
            { label: 'Nội dung ô', type: 'textarea', dataKey: 'value' },
            { label: 'Mô tả ô', description: '(Giải thích cho AI về vai trò của nội dung ô này)', type: 'textarea', rows: 4, dataKey: 'cellPrompt' },
        ],
    },
    sheetConfig: {
        formTitle: "Chỉnh sửa thuộc tính bảng",
        formDescription: "Cài đặt miền, loại và tên của bảng.",
        fields: [
            /* {
                label: 'Vị trí lưu mặc định', type: 'select', dataKey: 'domain',
                options: [
                    // { value: 'global', text: `<i class="fa-solid fa-earth-asia"></i> Global (Mẫu được lưu trong dữ liệu người dùng)` },
                    // { value: 'role', text: `<i class="fa-solid fa-user-tag"></i> Role (Mẫu được lưu trong nhân vật hiện tại)` },
                    { value: 'chat', text: `<i class="fa-solid fa-comment"></i> Chat (Mẫu được lưu trong cuộc hội thoại hiện tại)` },
                ],
            }, */
            {
                label: 'Loại', type: 'select', dataKey: 'type',
                options: [
                    // { value: 'free', text: `<i class="fa-solid fa-table"></i> Free (AI có thể tùy ý sửa đổi bảng này)` },
                    { value: 'dynamic', text: `<i class="fa-solid fa-arrow-down-wide-short"></i> Dynamic (AI có thể thực hiện tất cả thao tác ngoài chèn cột)` },
                    // { value: 'fixed', text: `<i class="fa-solid fa-thumbtack"></i> Fixed (AI không thể xóa hoặc chèn hàng và cột)` },
                    // { value: 'static', text: `<i class="fa-solid fa-link"></i> Static (Bảng này chỉ đọc được với AI)` }
                ],
            },
            { label: 'Tên bảng', type: 'text', dataKey: 'name' },
            { label: 'Mô tả bảng (từ gợi ý)', type: 'textarea', rows: 6, dataKey: 'note', description: '(Là từ gợi ý tổng thể cho bảng, giải thích cho AI về vai trò của bảng này)' },
            { label: 'Có bắt buộc điền không', type: 'checkbox', dataKey: 'required' },
            { label: 'Có kích hoạt gửi không', type: 'checkbox', dataKey: 'triggerSend' },
            { label: 'Độ sâu kích hoạt gửi', type: 'number', dataKey: 'triggerSendDeep' },
            { label: 'Từ gợi ý khởi tạo', type: 'textarea', rows: 4, dataKey: 'initNode', description: '（Khi bảng là bắt buộc và trống, từ gợi ý này sẽ được gửi để yêu cầu AI điền bảng）' },
            { label: 'Từ gợi ý chèn', type: 'textarea', rows: 4, dataKey: 'insertNode', description: '' },
            { label: 'Từ gợi ý xóa', type: 'textarea', rows: 4, dataKey: 'deleteNode', description: '' },
            { label: 'Từ gợi ý cập nhật', type: 'textarea', rows: 4, dataKey: 'updateNode', description: '' },
        ],
    },
};

async function updateDropdownElement() {
    const templates = getSheets();
    // console.log("Mẫu trượt xuống", templates)
    if (dropdownElement === null) {
        dropdownElement = document.createElement('select');
        dropdownElement.id = 'table_template';
        dropdownElement.classList.add('select2_multi_sameline', 'select2_choice_clickable', 'select2_choice_clickable_buttonstyle');
        dropdownElement.multiple = true;
    }
    dropdownElement.innerHTML = '';
    for (const t of templates) {
        const optionElement = document.createElement('option');
        optionElement.value = t.uid;
        optionElement.textContent = t.name;
        dropdownElement.appendChild(optionElement);
    }

    return dropdownElement;
}

function getAllDropdownOptions() {
    return $(dropdownElement).find('option').toArray().map(option => option.value);
}

function updateSelect2Dropdown() {
    let selectedSheets = getSelectedSheetUids()
    if (selectedSheets === undefined) {
        selectedSheets = [];
    }
    $(dropdownElement).val(selectedSheets).trigger("change", [true])
}

function initChatScopeSelectedSheets() {
    const newSelectedSheets = BASE.sheetsData.context.map(sheet => sheet.enable ? sheet.uid : null).filter(Boolean)
    USER.getContext().chatMetadata.selected_sheets = newSelectedSheets
    return newSelectedSheets
}

function updateSelectedSheetUids() {
    if (scope === 'chat') {
        USER.saveChat()
        console.log("Đã kích hoạt tại đây")
        BASE.refreshContextView()
    }
    else USER.saveSettings();
    updateDragTables();
}

function initializeSelect2Dropdown(dropdownElement) {
    $(dropdownElement).select2({
        closeOnSelect: false,
        templateResult: function (data) {
            if (!data.id) {
                return data.text;
            }
            var $wrapper = $('<span class="select2-option" style="width: 100%"></span>');
            var $checkbox = $('<input type="checkbox" class="select2-option-checkbox"/>');
            $checkbox.prop('checked', data.selected);
            $wrapper.append(data.text);
            return $wrapper;
        },
        templateSelection: function (data) {
            return data.text;
        },
        escapeMarkup: function (markup) {
            return markup;
        }
    });

    updateSelect2Dropdown()

    $(dropdownElement).on('change', function (e, silent) {
        //if(silent || scope === 'chat') return
        console.log("Đã chọn", silent, $(this).val())
        if (silent) return
        setSelectedSheetUids($(this).val())
        updateSelectedSheetUids()
    });

    // Tạo mối liên kết giữa checkbox cha và dropdown
    const firstOptionText = $(dropdownElement).find('option:first-child').text();
    const tableMultipleSelectionDropdown = $('<span class="select2-option" style="width: 100%"></span>');
    const checkboxForParent = $('<input type="checkbox" class="select2-option-checkbox"/>');
    tableMultipleSelectionDropdown.append(checkboxForParent);
    tableMultipleSelectionDropdown.append(firstOptionText);
    $('#parentFileBox')?.append(tableMultipleSelectionDropdown);

    const select2MultipleSelection = $(dropdownElement).next('.select2-container--default');
    if (select2MultipleSelection.length) {
        select2MultipleSelection.css('width', '100%');
    }
}

function updateSheetStatusBySelect() {
    const selectedSheetsUid = getSelectedSheetUids()
    const templates = getSheets()
    templates.forEach(temp => {
        if (selectedSheetsUid.includes(temp.uid)) temp.enable = true
        else temp.enable = false
        temp.save && temp.save(undefined, true)
    })
}

export function updateSelectBySheetStatus() {
    const templates = getSheets()
    const selectedSheetsUid = templates.filter(temp => temp.enable).map(temp => temp.uid)
    setSelectedSheetUids(selectedSheetsUid)
}

let table_editor_container = null

function bindSheetSetting(sheet, index) {
    const titleBar = document.createElement('div');
    titleBar.className = 'table-title-bar';
    titleBar.style.display = 'flex';
    titleBar.style.alignItems = 'center';
    titleBar.style.minWidth = '500px';
    titleBar.style.gap = '5px';
    titleBar.style.color = 'var(--SmartThemeEmColor)';
    titleBar.style.fontSize = '0.8rem';
    titleBar.style.fontWeight = 'normal';

    // Nút cài đặt cơ bản bảng
    const settingButton = $(`<i class="menu_button menu_button_icon fa-solid fa-wrench" style="cursor: pointer; height: 28px; width: 28px;" title="Chỉnh sửa thuộc tính bảng"></i>`);
    settingButton.on('click', async () => {
        const initialData = {
            domain: sheet.domain,
            type: sheet.type,
            name: sheet.name,
            note: sheet.data.note,
            initNode: sheet.data.initNode,
            insertNode: sheet.data.insertNode,
            deleteNode: sheet.data.deleteNode,
            updateNode: sheet.data.updateNode,
            required: sheet.required,
            triggerSend: sheet.triggerSend,
            triggerSendDeep: sheet.triggerSendDeep
        };
        const formInstance = new Form(formConfigs.sheetConfig, initialData);
        const popup = new EDITOR.Popup(formInstance.renderForm(), EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "Lưu", allowVerticalScrolling: true, cancelButton: "Hủy" });

        await popup.show();
        if (popup.result) {
            const diffData = compareDataDiff(formInstance.result(), initialData)
            console.log(diffData)
            let needRerender = false
            // Cập nhật kết quả khác biệt dữ liệu vào bảng
            Object.keys(diffData).forEach(key => {
                console.log(key)
                if (['domain', 'type', 'name', 'required', 'triggerSend'].includes(key) && diffData[key] != null) {
                    console.log("So sánh thành công, sẽ cập nhật " + key)
                    sheet[key] = diffData[key];
                    if (key === 'name') needRerender = true
                } else if (['note', 'initNode', 'insertNode', 'deleteNode', 'updateNode'].includes(key) && diffData[key] != null) {
                    sheet.data[key] = diffData[key];
                } else if (['triggerSendDeep'].includes(key) && diffData[key] != null) {
                    console.log("So sánh thành công, sẽ cập nhật " + key)
                    sheet[key] = Math.max(0, Math.floor(diffData[key]));
                }
            })
            sheet.save()
            if (needRerender) refreshTempView()
        }
    });

    // Nút kiểu tùy chỉnh bảng
    const styleButton = $(`<i class="menu_button menu_button_icon fa-solid fa-wand-magic-sparkles" style="cursor: pointer; height: 28px; width: 28px;" title="Chỉnh sửa kiểu hiển thị bảng"></i>`);
    styleButton.on('click', async () => {
        await openSheetStyleRendererPopup(sheet);
    })
    const nameSpan = $(`<span style="margin-left: 0px;">#${index} ${sheet.name ? sheet.name : 'Bảng không tên'}</span>`);

    // Thêm: Checkbox gửi đến ngữ cảnh
    const sendToContextCheckbox = $(`
        <label class="checkbox_label" style="margin-left: 10px; font-weight: normal; color: var(--text_primary);">
            <input type="checkbox" class="send_to_context_switch" ${sheet.sendToContext !== false ? 'checked' : ''} />
            <span data-i18n="Send to context">Gửi đến ngữ cảnh</span>
        </label>
    `);

    sendToContextCheckbox.find('.send_to_context_switch').on('change', function() {
        sheet.sendToContext = $(this).prop('checked');
        sheet.save();
        console.log(`Trạng thái sendToContext của bảng "${sheet.name}" đã được cập nhật thành: ${sheet.sendToContext}`);
    });

    titleBar.appendChild(settingButton[0]);
    // titleBar.appendChild(originButton[0]);
    titleBar.appendChild(styleButton[0]);
    titleBar.appendChild(nameSpan[0]);
    titleBar.appendChild(sendToContextCheckbox[0]);

    return titleBar;
}

async function templateCellDataEdit(cell) {
    const initialData = { ...cell.data };
    const formInstance = new Form(formConfigs[cell.type], initialData);

    formInstance.on('editRenderStyleEvent', (formData) => {
        alert('Chức năng chỉnh sửa kiểu bảng chưa được thực hiện' + JSON.stringify(formData));
    });

    const popup = new EDITOR.Popup(formInstance.renderForm(), EDITOR.POPUP_TYPE.CONFIRM, { large: true, allowVerticalScrolling: true }, { okButton: "Lưu thay đổi", cancelButton: "Hủy" });

    await popup.show();
    if (popup.result) {
        const diffData = compareDataDiff(formInstance.result(), initialData)
        console.log(diffData)
        Object.keys(diffData).forEach(key => {
            cell.data[key] = diffData[key];
        })
        const pos = cell.position
        cell.parent.save()
        cell.renderCell()
        // cell.parent.updateRender()
        refreshTempView(true);
        if (scope === 'chat') BASE.refreshContextView()
    }
}

function handleAction(cell, action) {
    console.log("Bắt đầu thực hiện thao tác")
    cell.newAction(action)
    console.log("Thực hiện thao tác rồi làm mới")
    refreshTempView();
    // Nếu là miền chat, thì làm mới bảng
    if (scope === 'chat') BASE.refreshContextView()
}

function bindCellClickEvent(cell) {
    cell.on('click', async (event) => {
        event.stopPropagation();
        if (cell.parent.currentPopupMenu) {
            cell.parent.currentPopupMenu.destroy();
            cell.parent.currentPopupMenu = null;
        }
        cell.parent.currentPopupMenu = new PopupMenu();

        const [rowIndex, colIndex] = cell.position;
        const sheetType = cell.parent.type;

        if (rowIndex === 0 && colIndex === 0) {
            cell.parent.currentPopupMenu.add('<i class="fa fa-arrow-right"></i> Chèn cột bên phải', (e) => { handleAction(cell, Cell.CellAction.insertRightColumn) });
            if (sheetType === SheetBase.SheetType.free || sheetType === SheetBase.SheetType.static) {
                cell.parent.currentPopupMenu.add('<i class="fa fa-arrow-down"></i> Chèn hàng bên dưới', (e) => { handleAction(cell, Cell.CellAction.insertDownRow) });
            }
        } else if (rowIndex === 0) {
            cell.parent.currentPopupMenu.add('<i class="fa fa-i-cursor"></i> Chỉnh sửa cột này', async (e) => { await templateCellDataEdit(cell) });
            cell.parent.currentPopupMenu.add('<i class="fa fa-arrow-left"></i> Chèn cột bên trái', (e) => { handleAction(cell, Cell.CellAction.insertLeftColumn) });
            cell.parent.currentPopupMenu.add('<i class="fa fa-arrow-right"></i> Chèn cột bên phải', (e) => { handleAction(cell, Cell.CellAction.insertRightColumn) });
            cell.parent.currentPopupMenu.add('<i class="fa fa-trash-alt"></i> Xóa cột', (e) => { handleAction(cell, Cell.CellAction.deleteSelfColumn) });
        } else if (colIndex === 0) {
            // if (sheetType === cell.parent.SheetType.dynamic) {
            //     cell.element.delete();
            //     return;
            // }

            cell.parent.currentPopupMenu.add('<i class="fa fa-i-cursor"></i> Chỉnh sửa hàng này', async (e) => { await templateCellDataEdit(cell) });
            if (sheetType === SheetBase.SheetType.free || sheetType === SheetBase.SheetType.static) {
                cell.parent.currentPopupMenu.add('<i class="fa fa-arrow-up"></i> Chèn hàng bên trên', (e) => { handleAction(cell, Cell.CellAction.insertUpRow) });
                cell.parent.currentPopupMenu.add('<i class="fa fa-arrow-down"></i> Chèn hàng bên dưới', (e) => { handleAction(cell, Cell.CellAction.insertDownRow) });
                cell.parent.currentPopupMenu.add('<i class="fa fa-trash-alt"></i> Xóa hàng', (e) => { handleAction(cell, Cell.CellAction.deleteSelfRow) });
            }
        } else {
            if (sheetType === SheetBase.SheetType.static) {
                cell.parent.currentPopupMenu.add('<i class="fa fa-i-cursor"></i> Chỉnh sửa ô này', async (e) => { await templateCellDataEdit(cell) });
            } else {
                return;
            }
        }

        const element = event.target
        // Sao lưu style hiện tại của ô để khôi phục khi menu đóng
        const style = element.style.cssText;
        const rect = element.getBoundingClientRect();
        const dragSpaceRect = drag.dragSpace.getBoundingClientRect();
        let popupX = rect.left - dragSpaceRect.left;
        let popupY = rect.top - dragSpaceRect.top;
        popupX /= drag.scale;
        popupY /= drag.scale;
        popupY += rect.height / drag.scale + 3;

        element.style.backgroundColor = 'var(--SmartThemeUserMesBlurTintColor)';
        element.style.color = 'var(--SmartThemeQuoteColor)';
        element.style.outline = '1px solid var(--SmartThemeQuoteColor)';
        element.style.zIndex = '999';

        drag.add('menu', cell.parent.currentPopupMenu.renderMenu());
        cell.parent.currentPopupMenu.show(popupX, popupY).then(() => {
            element.style.cssText = style;
        });
    });
}

function getSelectedSheetUids() {
    return scope === 'chat' ? USER.getContext().chatMetadata.selected_sheets ?? initChatScopeSelectedSheets() : USER.getSettings().table_selected_sheets ?? []
}

function setSelectedSheetUids(selectedSheets) {
    if (scope === 'chat') {
        USER.getContext().chatMetadata.selected_sheets = selectedSheets;
    } else {
        USER.getSettings().table_selected_sheets = selectedSheets;
    }
    updateSheetStatusBySelect()
}

function getSheets() {
    return scope === 'chat' ? BASE.getChatSheets() : BASE.templates
}

async function updateDragTables() {
    if (!drag) return;

    const selectedSheetUids = getSelectedSheetUids()
    const container = $(drag.render).find('#tableContainer');
    table_editor_container.querySelector('#contentContainer').style.outlineColor = scope === 'chat' ? '#cf6e64' : '#41b681';

    if (currentPopupMenu) {
        currentPopupMenu.destroy();
        currentPopupMenu = null;
    }

    container.empty();
    console.log("dragSpace là gì", drag.dragSpace)

    selectedSheetUids.forEach((uid, index) => {

        let sheetDataExists;
        if (scope === 'chat') {
            // Kiểm tra xem uid có tồn tại trong BASE.sheetsData.context không
            sheetDataExists = BASE.sheetsData.context?.some(sheetData => sheetData.uid === uid);
        } else {
            // Kiểm tra xem uid có tồn tại trong BASE.templates không
            sheetDataExists = BASE.templates?.some(templateData => templateData.uid === uid);
        }
        // Nếu dữ liệu không tồn tại, ghi cảnh báo và bỏ qua uid này
        if (!sheetDataExists) {
            console.warn(`Không tìm thấy dữ liệu bảng có UID là ${uid} trong updateDragTables (scope: ${scope}). Bỏ qua bảng này.`);
            return;
        }

        let sheet = scope === 'chat'
            ? BASE.getChatSheet(uid)
            : new BASE.SheetTemplate(uid);
        sheet.currentPopupMenu = currentPopupMenu;

        // if (!sheet || !sheet.hashSheet) {
        //     console.warn(`Không thể tải mẫu hoặc dữ liệu mẫu trống, UID: ${uid}`);
        //     return
        // }

        const tableElement = sheet.renderSheet(bindCellClickEvent, sheet.hashSheet.slice(0, 1));
        tableElement.style.marginLeft = '5px'
        renderedTables.set(uid, tableElement);
        container.append(tableElement);

        // Sau khi thêm bảng, thêm phần tử hr
        const hr = document.createElement('hr');
        tableElement.appendChild(hr);

        const captionElement = document.createElement('caption');
        captionElement.appendChild(bindSheetSetting(sheet, index));
        if (tableElement.querySelector('caption')) {
            tableElement.querySelector('caption').replaceWith(captionElement);
        } else {
            tableElement.insertBefore(captionElement, tableElement.firstChild);
        }
    })

}

export function updateTableContainerPosition() {
    const windowHeight = window.innerHeight;
    const contentContainer = table_editor_container.querySelector('#contentContainer');
    // console.log("contentContainer", contentContainer)
    const sendFormHeight = document.querySelector('#send_form')?.getBoundingClientRect().height || 0;
    const rect = contentContainer.getBoundingClientRect();
    // console.log("Vị trí contentContainer thay đổi", rect, windowHeight, sendFormHeight)
    contentContainer.style.position = 'flex';
    contentContainer.style.bottom = '0';
    contentContainer.style.left = '0';
    contentContainer.style.width = '100%';
    contentContainer.style.height = `calc(${windowHeight}px - ${rect.top}px - ${sendFormHeight}px)`;
}

export async function refreshTempView(ignoreGlobal = false) {
    if (ignoreGlobal && scope === 'global') return
    console.log("Làm mới giao diện mẫu bảng")
    await updateDropdownElement()
    initializeSelect2Dropdown(dropdownElement);
    await updateDragTables();
}

async function initTableEdit(mesId) {
    table_editor_container = $(await SYSTEM.getTemplate('sheetTemplateEditor')).get(0);
    const tableEditTips = table_editor_container.querySelector('#tableEditTips');
    const tableContainer = table_editor_container.querySelector('#tableContainer');
    const contentContainer = table_editor_container.querySelector('#contentContainer');
    const scopeSelect = table_editor_container.querySelector('#structure_setting_scope');

    dropdownElement = await updateDropdownElement()
    $(tableEditTips).after(dropdownElement)
    initializeSelect2Dropdown(dropdownElement);

    $(contentContainer).empty()
    drag = new EDITOR.Drag();
    const draggable = drag.render
    contentContainer.append(draggable);
    drag.add('tableContainer', tableContainer);

    // Thêm trình nghe sự kiện
    contentContainer.addEventListener('mouseenter', updateTableContainerPosition);
    contentContainer.addEventListener('focus', updateTableContainerPosition);

    $(scopeSelect).val(scope).on('change', async function () {
        scope = $(this).val();
        console.log("Chuyển sang", scope)
        await refreshTempView()
    })

    $(document).on('click', '#add_table_template_button', async function () {
        console.log("Đã kích hoạt")
        let newTemplateUid = null
        let newTemplate = null
        if (scope === 'chat') {
            newTemplate = BASE.createChatSheet(2, 1)
            newTemplateUid = newTemplate.uid
            newTemplate.save()
        } else {
            newTemplate = new BASE.SheetTemplate().createNewTemplate();
            newTemplateUid = newTemplate.uid
        }

        let currentSelectedValues = getSelectedSheetUids()
        setSelectedSheetUids([...currentSelectedValues, newTemplateUid])
        if (scope === 'chat') USER.saveChat()
        else USER.saveSettings();
        await updateDropdownElement();
        //updateDragTables();
        console.log("Kiểm tra", [...currentSelectedValues, newTemplateUid])
        $(dropdownElement).val([...currentSelectedValues, newTemplateUid]).trigger("change", [true]);
        updateSelectedSheetUids()
    });
    $(document).on('click', '#import_table_template_button', function () {

    })
    $(document).on('click', '#export_table_template_button', function () {

    })
    // $(document).on('click', '#sort_table_template_button', function () {
    //
    // })

    // $(document).on('click', '#table_template_history_button', function () {
    //
    // })
    // $(document).on('click', '#destroy_table_template_button', async function () {
    //     const r = scope ==='chat'? BASE.destroyAllContextSheets() : BASE.destroyAllTemplates()
    //     if (r) {
    //         await updateDropdownElement();
    //         $(dropdownElement).val([]).trigger('change');
    //         updateDragTables();
    //     }
    // });

    updateDragTables();

    return table_editor_container;
}

export async function getEditView(mesId = -1) {
    // Nếu đã khởi tạo, trả về container được lưu trong bộ nhớ cache, tránh tạo lại
    if (table_editor_container) {
        // Cập nhật dropdown và bảng, nhưng không tạo lại toàn bộ container
        await refreshTempView(false);
        return table_editor_container;
    }
    return await initTableEdit(mesId);
}
