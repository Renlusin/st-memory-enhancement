const MenuItemType = {
    normal: 'normal',
    warning: 'warning',
}

/**
 * @description Lớp Menu bật lên - Dùng để tạo và quản lý menu bật lên
 */
export class PopupMenu {
    ItemType = MenuItemType
    /**
     * Thuộc tính tĩnh, dùng để lưu trữ instance PopupMenu hiện tại, sử dụng như một singleton trong phạm vi toàn cục
     * @type {null}
     */
    static instance = null;

    /**
     * Hàm khởi tạo
     * @param {object} [options] - Các tùy chọn cấu hình
     * @param {boolean} [options.lasting=false] - Có duy trì hay không, nếu true thì không hủy instance khi nhấp ra ngoài hoặc nhấp vào mục menu, chỉ ẩn
     */
    constructor(options = {}) {
        if (PopupMenu.instance) {
            PopupMenu.instance.destroy();
        }

        this.menuItems = [];
        this.lasting = false;
        this.popupContainer = null;
        this._closePromise = null;
        this._closeResolver = null;
        this._frameUpdateId = null;

        this.#init(options);
        PopupMenu.instance = this;
    }

    add(html, event, type = MenuItemType.normal) {
        const index = this.menuItems.length;
        this.menuItems.push({ html, event, type });
        this.menuItemIndexMap.set(html, index); // Lưu trữ ánh xạ giữa nội dung HTML và chỉ số
    }

    renderMenu() {
        this.menuContainer.innerHTML = '';

        this.menuItems.forEach((item, index, type) => {
            const menuItem = document.createElement('div');
            menuItem.innerHTML = item.html;
            menuItem.style.padding = '5px';
            menuItem.style.cursor = 'pointer';
            menuItem.style.userSelect = 'none';
            menuItem.style.justifyContent = 'flex-start';
            menuItem.style.alignItems = 'center';
            menuItem.classList.add('dynamic-popup-menu-item', 'list-group-item');

            if (item.type === MenuItemType.warning) {
                menuItem.classList.add('redWarningText');
            }

            this.menuContainer.appendChild(menuItem);

            // Lưu trữ ánh xạ giữa phần tử menu và chỉ số
            this.menuItemIndexMap.set(menuItem, index);
        });

        return this.popupContainer;
    }

    /**
     * Hiển thị menu
     * @param {number} x - Tọa độ ngang hiển thị menu (tương đối với phần tử cha)
     * @param {number} y - Tọa độ dọc hiển thị menu (tương đối với phần tử cha)
     * @returns {Promise} Trả về một Promise, được resolve khi menu đóng
     */
    async show(x = 0, y = 0) {
        // Dọn dẹp Promise đóng trước đó
        if (this._closePromise) {
            this._closeResolver?.();
            this._closePromise = null;
            this._closeResolver = null;
        }

        this.popupContainer.style.left = `${x}px`;
        this.popupContainer.style.top = `${y}px`;
        this.popupContainer.style.display = 'block';
        this.popupContainer.style.zIndex = '9999';

        // Tạo Promise mới để theo dõi sự kiện đóng
        this._closePromise = new Promise((resolve) => {
            this._closeResolver = resolve;
        });

        setTimeout(() => {
            document.addEventListener('click', this.handleClickOutside.bind(this));
        }, 0);

        return this._closePromise;
    }

    /**
     * Ẩn menu
     */
    hide() {
        this.cancelFrameUpdate();
        this.popupContainer.style.display = 'none';
        document.removeEventListener('click', this.handleClickOutside.bind(this));

        // Kích hoạt resolve của Promise đóng
        this._closeResolver?.();
        this._closePromise = null;
        this._closeResolver = null;
    }

    /**
     * Hủy menu
     */
    destroy() {
        this.cancelFrameUpdate();
        document.removeEventListener('click', this.handleClickOutside.bind(this));
        if (this.popupContainer.parentNode) {
            this.popupContainer.parentNode.removeChild(this.popupContainer);
        }

        // Kích hoạt resolve của Promise đóng
        this._closeResolver?.();
        this._closePromise = null;
        this._closeResolver = null;
    }

    #init(options) {
        this.menuItems = [];
        this.lasting = options.lasting === true;
        this.menuItemIndexMap = new Map();      // Sử dụng Map để lưu trữ mối quan hệ ánh xạ giữa các mục menu và chỉ số

        this.popupContainer = document.createElement('div');
        this.popupContainer.style.position = 'absolute';
        this.popupContainer.style.display = 'none';
        this.popupContainer.style.zIndex = '1000';
        this.popupContainer.style.width = '180px';
        this.popupContainer.style.height = 'auto';
        this.popupContainer.style.background = 'none';
        this.popupContainer.style.border = 'none';
        this.popupContainer.style.borderRadius = '6px';
        this.popupContainer.style.boxShadow = '0 0 20px rgba(0,0,0,0.2)';
        this.popupContainer.style.backgroundColor = 'var(--SmartThemeBlurTintColor)';

        this.menuContainer = $('<div class="dynamic-popup-menu" id="dynamic_popup_menu"></div>')[0];
        this.menuContainer.style.position = 'relative';
        this.menuContainer.style.padding = '2px 0';
        this.menuContainer.style.backgroundColor = 'var(--SmartThemeUserMesBlurTintColor)';
        this.menuContainer.style.backdropFilter = 'blur(calc(var(--SmartThemeBlurStrength)*2))';
        this.menuContainer.style.webkitBackdropFilter = 'blur(var(--SmartThemeBlurStrength))';
        this.menuContainer.style.border = '1px solid var(--SmartThemeBorderColor)';
        this.menuContainer.style.borderRadius = '6px';

        this.popupContainer.appendChild(this.menuContainer);

        this.handleMenuItemClick = this.handleMenuItemClick.bind(this);
        this.handleClickOutside = this.handleClickOutside.bind(this);
        this.popupContainer.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.handleMenuItemClick(event);
        });
    }

    handleMenuItemClick(event) {
        const menuItemElement = event.target.closest('.dynamic-popup-menu-item');
        if (menuItemElement) {
            // Lấy trực tiếp chỉ số từ Map
            const index = this.menuItemIndexMap.get(menuItemElement);
            if (index !== undefined && this.menuItems[index].event) {
                this.menuItems[index].event(event);
                if (this.lasting) {
                    this.hide();
                } else {
                    this.destroy();
                }
            }
        }
    }

    /**
     * Xử lý nhấp chuột bên ngoài khu vực menu để đóng menu
     * @param {MouseEvent} event
     */
    handleClickOutside(event) {
        if (!this.popupContainer.contains(event.target)) {
            if (this.lasting) {
                this.hide();
            } else {
                this.destroy();
            }
        }
    }

    frameUpdate(callback) {
        // Dọn dẹp vòng lặp hoạt hình hiện tại
        this.cancelFrameUpdate();

        // Chỉ khởi động vòng lặp hoạt hình khi menu được hiển thị
        if (this.popupContainer.style.display !== 'none') {
            const updateLoop = (timestamp) => {
                // Nếu menu bị ẩn, dừng vòng lặp
                if (this.popupContainer.style.display === 'none') {
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
