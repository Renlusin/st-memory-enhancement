import {SYSTEM, USER} from "../core/manager.js";

// Bản đồ tĩnh để theo dõi các popup bị vô hiệu hóa tạm thời theo ID
const disabledPopups = {};
// Bản đồ tĩnh để theo dõi các popup luôn được xác nhận trong phiên hiện tại
const alwaysConfirmPopups = {};

const bgc = '#3736bb'
const bgcg = '#de81f1'
// const bgc = 'var(--SmartThemeBotMesBlurTintColor)'
// const bgcg = 'var(--SmartThemeUserMesBlurTintColor)'
const tc = '#fff'

export async function newPopupConfirm(text, cancelText = 'Hủy', confirmText = 'Xác nhận', id = '', dontRemindText = null, alwaysConfirmText = null) {
    if (id && disabledPopups[id]) {
        return Promise.resolve('dont_remind_active'); // Bị vô hiệu hóa vĩnh viễn, không hiển thị
    }
    if (id && alwaysConfirmPopups[id]) {
        return Promise.resolve(true); // Luôn xác nhận chỉ trong phiên, resolve là true nhưng vẫn hiển thị popup
    }
    return await new PopupConfirm().show(text, cancelText, confirmText, id, dontRemindText, alwaysConfirmText);
}

export class PopupConfirm {
    static get disabledPopups() { // Getter để truy cập bên ngoài nếu cần, mặc dù sửa đổi trực tiếp nằm trong _handleAction
        return disabledPopups;
    }

    constructor() {
        this.uid = SYSTEM.generateRandomString(10);
        // this.confirm = false; // Ít liên quan hơn bây giờ với các resolution promise cụ thể
        this.toastContainer = null;
        this.toastElement = null;
        this.resolvePromise = null;
        this._text = '';
        this.messageText = null; // Lưu trữ tham chiếu đến phần tử văn bản
        this.id = null; // Để lưu trữ ID của popup
    }

    _handleAction(resolutionValue) {
        let actualResolutionValue = resolutionValue;
        if (resolutionValue === 'dont_remind_selected' && this.id) {
            disabledPopups[this.id] = true;
            actualResolutionValue = true; // Coi như đã nhấn "Xác nhận"
        } else if (resolutionValue === 'always_confirm_selected' && this.id) {
            alwaysConfirmPopups[this.id] = true;
            actualResolutionValue = true; // Coi như đã nhấn "Xác nhận"
        }

        if (this.toastElement) {
            this.toastElement.style.opacity = '0';
            setTimeout(() => {
                if (this.toastContainer && this.toastElement && this.toastElement.parentNode === this.toastContainer) {
                    this.toastContainer.removeChild(this.toastElement);
                }
                if (this.toastContainer && this.toastContainer.children.length === 0 && document.body.contains(this.toastContainer)) {
                    document.body.removeChild(this.toastContainer);
                }
                this.toastElement = null;
            }, 300);
        }
        if (this.resolvePromise) {
            this.resolvePromise(actualResolutionValue);
        }
    }

    // Thêm getter và setter cho thuộc tính text
    get text() {
        return this._text;
    }

    set text(value) {
        this._text = value;
        if (this.messageText) {
            this.messageText.textContent = value;
        }
    }

    async show(message = 'Bạn có chắc không?', cancelText = 'Hủy', confirmText = 'Xác nhận', id = null, dontRemindText = null, alwaysConfirmText = null) {
        this._text = message;
        this.id = id; // Lưu trữ ID

        this.toastContainer = document.getElementById('toast-container');
        if (!this.toastContainer) {
            this.toastContainer = document.createElement('div');
            this.toastContainer.id = 'toast-container';
            this.toastContainer.className = 'toast-top-center';

            document.body.appendChild(this.toastContainer);
        }

        // Tạo phần tử toast
        this.toastElement = document.createElement('div');
        this.toastElement.id = this.uid;
        this.toastElement.className = 'toast toast-confirm';
        this.toastElement.setAttribute('aria-live', 'polite');

        this.toastElement.style.padding = '6px 12px';
        this.toastElement.style.pointerEvents = 'auto';
        this.toastElement.style.cursor = 'normal';
        this.toastElement.style.boxShadow = '0 0 10px rgba(0, 0, 0, 1)';
        this.toastElement.style.transform = 'translateY(-30px)';
        this.toastElement.style.opacity = '0';
        this.toastElement.style.transition = 'all 0.3s ease';

        this.toastElement.style.background = `linear-gradient(to bottom right, ${bgc} 20%, ${bgcg})`;
        this.toastElement.style.backdropFilter = 'blur(calc(var(--SmartThemeBlurStrength)*2))';
        this.toastElement.style.webkitBackdropFilter = 'blur(var(--SmartThemeBlurStrength))';

        // Tạo container cho thông điệp
        const messageEl = $('<div class="toast-message"></div>')[0];
        const messageIcon = $('<i class="fa-solid fa-code-branch""></i>')[0];
        this.messageText = $('<span id="toast_message_text"></span>')[0]; // Lưu trữ làm thuộc tính lớp
        messageEl.style.display = 'flex';
        messageEl.style.flexDirection = 'row';
        messageEl.style.alignItems = 'center';
        messageEl.style.marginTop = '5px';
        messageEl.style.marginBottom = '10px';
        messageEl.style.color = tc;
        messageEl.style.fontWeight = 'bold';
        messageEl.style.gap = '10px';

        messageIcon.style.fontSize = '1.3rem';
        messageIcon.style.padding = '0'
        messageIcon.style.margin = '0'

        this.messageText.textContent = this._text; // Sử dụng giá trị text được lưu trữ
        messageEl.appendChild(messageIcon);
        messageEl.appendChild(this.messageText);

        // Tạo container cho các nút
        const buttons = document.createElement('div');
        buttons.style.display = 'flex';
        buttons.style.justifyContent = 'flex-end';
        buttons.style.gap = '10px';

        // Tạo nút xác nhận
        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = confirmText;
        confirmBtn.style.width = '100%'
        confirmBtn.style.padding = '3px 12px';
        confirmBtn.style.backgroundColor = bgc;
        confirmBtn.style.color = tc;
        confirmBtn.style.border = 'none';
        confirmBtn.style.borderRadius = '6px';
        confirmBtn.style.cursor = 'pointer';
        confirmBtn.style.fontSize = '0.85rem';
        confirmBtn.style.fontWeight = 'bold';
        confirmBtn.classList.add('popup-button-ok', 'menu_button', 'result-control', 'interactable');
        confirmBtn.onclick = () => this._handleAction(true);

        // Tạo nút hủy
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = cancelText;
        cancelBtn.style.width = '100%';
        cancelBtn.style.padding = '3px 12px';
        cancelBtn.style.background = 'none';
        // cancelBtn.style.backgroundColor = bgcg;
        cancelBtn.style.color = tc;
        cancelBtn.style.border = `1px solid ${bgc}`;
        cancelBtn.style.borderRadius = '6px';
        cancelBtn.style.cursor = 'pointer';
        cancelBtn.style.fontSize = '0.85rem';
        cancelBtn.classList.add('popup-button-cancel', 'menu_button', 'result-control', 'interactable');
        cancelBtn.onclick = () => this._handleAction(false);

        // Xây dựng cấu trúc DOM
        buttons.appendChild(cancelBtn); // Nút "Hủy"
        buttons.appendChild(confirmBtn); // Nút "Xác nhận"

        // Tạo nút "Không nhắc lại" nếu có text và id được cung cấp
        if (dontRemindText && this.id) {
            const dontRemindBtn = document.createElement('button');
            dontRemindBtn.textContent = dontRemindText; // Ví dụ: "Không nhắc lại"
            dontRemindBtn.style.width = '100%';
            dontRemindBtn.style.padding = '3px 12px';
            dontRemindBtn.style.background = 'none';
            dontRemindBtn.style.color = tc;
            dontRemindBtn.style.border = `1px solid ${bgcg}`;
            dontRemindBtn.style.borderRadius = '6px';
            dontRemindBtn.style.cursor = 'pointer';
            dontRemindBtn.style.fontSize = '0.85rem';
            dontRemindBtn.classList.add('popup-button-dont-remind', 'menu_button', 'result-control', 'interactable');
            dontRemindBtn.onclick = () => this._handleAction('dont_remind_selected');
            buttons.appendChild(dontRemindBtn);
        }
        
        // Tạo nút "Luôn xác nhận" nếu có text và id được cung cấp
        if (alwaysConfirmText && this.id) {
            const alwaysConfirmBtn = document.createElement('button');
            alwaysConfirmBtn.textContent = alwaysConfirmText; // Ví dụ: "Luôn xác nhận"
            alwaysConfirmBtn.style.width = '100%';
            alwaysConfirmBtn.style.padding = '3px 12px';
            alwaysConfirmBtn.style.background = 'none';
            alwaysConfirmBtn.style.color = tc;
            alwaysConfirmBtn.style.border = `1px solid ${bgc}`; // Giống nút hủy để phân biệt trực quan
            alwaysConfirmBtn.style.borderRadius = '6px';
            alwaysConfirmBtn.style.cursor = 'pointer';
            alwaysConfirmBtn.style.fontSize = '0.85rem';
            alwaysConfirmBtn.classList.add('popup-button-always-confirm', 'menu_button', 'result-control', 'interactable');
            alwaysConfirmBtn.onclick = () => this._handleAction('always_confirm_selected');
            buttons.appendChild(alwaysConfirmBtn);
        }

        this.toastElement.appendChild(messageEl);
        this.toastElement.appendChild(buttons);
        // this.toastContainer.appendChild(this.toastElement);
        // Chèn vào đầu container thay vì cuối
        this.toastContainer.insertBefore(this.toastElement, this.toastContainer.firstChild);

        // Kích hoạt hiệu ứng chuyển động
        setTimeout(() => {
            this.toastElement.style.transform = 'translateY(0)';
            this.toastElement.style.opacity = '1';
        }, 10);

        // Trả về một promise sẽ resolve khi người dùng nhấp vào nút
        return new Promise((resolve) => {
            this.resolvePromise = resolve; // _handleAction sẽ sử dụng
            // Các trình xử lý onclick của nút giờ được đặt trực tiếp để gọi _handleAction.
        });
    }

    // Đóng popup - this.close() có thể được gọi nếu một lực bên ngoài đóng popup.
    // _handleAction giờ quản lý đường dẫn dọn dẹp tiêu chuẩn.
    close() {
        this.cancelFrameUpdate();
        // Nếu resolvePromise tồn tại, nghĩa là popup đã được hiển thị và có thể chưa được resolve.
        // Resolve với giá trị mặc định (ví dụ: false hoặc giá trị 'closed_manually' cụ thể) nếu cần.
        // Hiện tại, chỉ đóng trực quan. Nếu _handleAction không được gọi, promise sẽ không resolve.
        // Hành vi này có thể cần điều chỉnh dựa trên cách .close() được sử dụng bên ngoài.
        // Thông thường, tương tác của người dùng (được xử lý bởi _handleAction) sẽ resolve promise.
        if (this.toastElement) {
            this.toastElement.style.opacity = '0';
            setTimeout(() => {
                if (this.toastContainer && this.toastElement && this.toastElement.parentNode === this.toastContainer) {
                    this.toastContainer.removeChild(this.toastElement);
                }
                if (this.toastContainer && this.toastContainer.children.length === 0 && document.body.contains(this.toastContainer)) {
                    document.body.removeChild(this.toastContainer);
                }
                this.toastElement = null;
            }, 300);
        }
        // Nếu promise cần được resolve khi close() được gọi từ bên ngoài:
        // if (this.resolvePromise) {
        //     this.resolvePromise('closed_externally'); // Hoặc false, hoặc null
        //     this.resolvePromise = null; // Ngăn chặn nhiều resolution
        // }
    }

    frameUpdate(callback) {
        // Dọn dẹp vòng lặp hoạt hình hiện tại
        this.cancelFrameUpdate();

        // Chỉ khởi động vòng lặp hoạt hình khi menu được hiển thị
        if (this.toastElement.style.display !== 'none') {
            const updateLoop = (timestamp) => {
                // Nếu menu bị ẩn, dừng vòng lặp
                if (this.toastElement.style.display === 'none') {
                    this.cancelFrameUpdate();
                    return;
                }

                callback(this, timestamp); // Thêm tham số timestamp để kiểm soát hoạt hình chính xác hơn
                this._frameUpdateId = requestAnimationFrame(updateLoop);
            };

            this._frameUpdateId = requestAnimationFrame(updateLoop);
        }
    }

    cancelFrameUpdate() {
        if (this._frameUpdateId) {
            cancelAnimationFrame(this._frameUpdateId);
            this._frameUpdateId = null;
        }
    }
}

// Lấy giá trị màu đã tính toán và đảm bảo hoàn toàn không trong suốt
// function getSolidColor (target) {
//     const colorValue = getComputedStyle(document.documentElement)
//         .getPropertyValue(target).trim();
//
//     // Tạo phần tử tạm để phân tích màu
//     const tempEl = document.createElement('div');
//     tempEl.style.color = colorValue;
//     document.body.appendChild(tempEl);
//
//     // Lấy giá trị RGB đã tính toán
//     const rgb = getComputedStyle(tempEl).color;
//     document.body.removeChild(tempEl);
//
//     // Đảm bảo trả về định dạng rgb() (không có alpha)
//     return rgb.startsWith('rgba') ? rgb.replace(/,[^)]+\)/, ')') : rgb;
// }
