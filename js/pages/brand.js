window.Pages = window.Pages || {};

Pages.Brand = (() => {

    function init() {
        console.log("Brand init");
        bind();
    }

    function bind() {
        // 未來擴充用
    }

    // ====== 全域複製功能（給 HTML 用）======
    function copyText(text) {
        navigator.clipboard.writeText(text);

        showToast("已複製");
    }

    function showToast(msg) {
        let toast = document.getElementById("copyToast");

        if (!toast) {
            toast = document.createElement("div");
            toast.id = "copyToast";
            toast.style.position = "fixed";
            toast.style.bottom = "20px";
            toast.style.right = "20px";
            toast.style.background = "#333";
            toast.style.color = "#fff";
            toast.style.padding = "10px 14px";
            toast.style.borderRadius = "8px";
            toast.style.fontSize = "14px";
            toast.style.zIndex = 9999;
            toast.style.opacity = "0";
            toast.style.transition = "0.2s";
            document.body.appendChild(toast);
        }

        toast.innerText = msg;
        toast.style.opacity = "1";

        setTimeout(() => {
            toast.style.opacity = "0";
        }, 1200);
    }

    // 👉 讓 HTML 可以直接呼叫
    window.copyText = copyText;

    return {
        init
    };

})();
