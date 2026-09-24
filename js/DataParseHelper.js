window.DataParseHelper = (() => {

    "use strict";

    // =========================================
    // render select
    // =========================================
    function renderSelect(
        select,
        list,
        valueKey,
        textKey,
        defaultText = "請選擇"
    ) {

        if (!select)
            return;

        select.innerHTML = "";
        select.add(new Option(defaultText, ""));

        list.forEach(item => {
            select.add(new Option(item[textKey], item[valueKey]));
        });
    }

    return {
        renderSelect
    };

})();
