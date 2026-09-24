window.Pages = window.Pages || {};

Pages.Formula = (() => {

    "use strict";


    const dom = {};


    let listCache = [];

    let detailList = [];

    let currentDetail = null;

    let mode = "view";





    function init() {


        cacheDom();

        bindEvents();


        // 頁面沒有「新增」按鈕，預設顯示新增表單
        openCreate(false);


        searchFormula();


    }









    function cacheDom() {



        dom.formCard =
            document.getElementById("formCard");


        dom.form =
            document.getElementById("formulaForm");



        dom.editHint =
            document.getElementById("editHint");



        dom.formulaList =
            document.getElementById("formulaList");


        dom.emptyHint =
            document.getElementById("emptyHint");



        dom.searchTitle =
            document.getElementById("searchTitle");


        dom.searchCount =
            document.getElementById("searchCount");




        // 搜尋

        dom.qFormulaName =
            document.getElementById("qFormulaName");


        dom.qFormulaCode =
            document.getElementById("qFormulaCode");


        dom.qProductID =
            document.getElementById("qProductID");


        dom.qInactive =
            document.getElementById("qInactive");




        dom.btnSearch =
            document.getElementById("btnSearch");



        dom.btnCreate =
            document.getElementById("btnCreate");


        dom.btnUpdate =
            document.getElementById("btnUpdate");


        dom.btnDelete =
            document.getElementById("btnDelete");


        dom.btnClear =
            document.getElementById("btnClear");



        dom.btnAddMaterial =
            document.getElementById("btnAddMaterial");





        // Formula 主表


        dom.FormulaCode =
            document.getElementById("FormulaCode");


        dom.ProductID =
            document.getElementById("ProductID");


        dom.FormulaName =
            document.getElementById("FormulaName");


        dom.VersionNo =
            document.getElementById("VersionNo");


        dom.YieldQty =
            document.getElementById("YieldQty");


        dom.YieldUnit =
            document.getElementById("YieldUnit");


        dom.IsActive =
            document.getElementById("IsActive");



        dom.Description =
            document.getElementById("Description");


        dom.Remark =
            document.getElementById("Remark");




        // Detail


        dom.formulaDetailList =
            document.getElementById(
                "formulaDetailList"
            );



    }









    function bindEvents() {



        dom.btnSearch?.addEventListener(
            "click",
            searchFormula
        );



        dom.btnCreate?.addEventListener(
            "click",
            submitFormula
        );



        dom.btnUpdate?.addEventListener(
            "click",
            submitFormula
        );



        dom.btnDelete?.addEventListener(
            "click",
            removeFormula
        );



        dom.btnClear?.addEventListener(
            "click",
            clearForm
        );




        dom.btnAddMaterial?.addEventListener(
            "click",
            addMaterialRow
        );





        dom.formulaList?.addEventListener(
            "click",
            async e => {



                const card =
                    e.target.closest(
                        ".formula-card"
                    );



                if (!card)
                    return;




                const item =
                    listCache[
                    card.dataset.index
                    ];



                await loadDetail(item);


            });


    }

    async function searchFormula() {

        try {

            const q = {
                name: dom.qFormulaName.value.trim(),
                code: dom.qFormulaCode.value.trim(),
                product: dom.qProductID.value.trim()
            };

            const list = (await API.list("Formula"))
                .filter(f =>
                    App.like(f.FormulaName, q.name) &&
                    App.like(f.FormulaCode, q.code) &&
                    App.like(f.ProductID, q.product) &&
                    (dom.qInactive.checked || f.IsActive !== false))
                .sort((a, b) => a.FormulaID - b.FormulaID);

            listCache = list;

            renderList({
                title: "🧪 配方列表",
                count: list.length,
                list
            });

        }

        catch (err) {

            App.error(err, "查詢配方失敗");

        }

    }

    function renderList(result) {



        dom.searchTitle.textContent =
            result.title || "配方列表";



        dom.searchCount.textContent =
            `共 ${result.count || result.list.length} 筆`;



        dom.formulaList.innerHTML =
            "";





        if (!result.list.length) {


            dom.emptyHint.classList.remove(
                "d-none"
            );


            return;


        }




        dom.emptyHint.classList.add(
            "d-none"
        );







        result.list.forEach(
            (item, index) => {



                const div =
                    document.createElement(
                        "div"
                    );



                div.className =
                    "formula-card";



                div.dataset.index =
                    index;






                div.innerHTML = `


                    <div class="formula-title">

                        🧪 ${App.esc(item.FormulaName || "")}

                    </div>


                    <div class="formula-info">

                        編號：
                        ${App.esc(item.FormulaCode || "")}

                    </div>


                    <div class="formula-info">

                        產品：
                        ${App.esc(item.ProductID || "")}

                    </div>


                    <div class="formula-info">

                        版本：
                        ${App.esc(item.VersionNo || "")}

                    </div>


                    <div class="formula-info">

                        產量：
                        ${item.YieldQty ?? 0}
                        ${App.esc(item.YieldUnit || "")}

                    </div>



                    <div class="mt-2">


                        ${item.IsActive !== false

                        ?

                        `<span class="badge bg-success">
                                啟用
                             </span>`

                        :

                        `<span class="badge bg-secondary">
                                停用
                             </span>`

                    }


                    </div>


                `;



                dom.formulaList.appendChild(
                    div
                );


            }
        );



    }









    async function loadDetail(item) {

        if (!item)
            return;

        try {

            const details =
                await API.list("FormulaDetail", { FormulaID: item.FormulaID });

            const data = {
                ...item,
                Detail: details.map(x => ({
                    MaterialID: x.MaterialID || "",
                    MaterialCode: x.MaterialCode || "",
                    MaterialName: x.MaterialName || "",
                    Quantity: x.Quantity ?? 0,
                    Unit: x.Unit || "",
                    Remark: x.Remark || ""
                }))
            };

            currentDetail = data;

            fillForm(data);

            showForm();

            setModeUI("edit");

            scrollToForm();

        }

        catch (err) {

            App.error(err, "讀取配方資料失敗");

        }

    }

    function fillForm(d) {



        dom.FormulaCode.value =
            d.FormulaCode || "";



        dom.ProductID.value =
            d.ProductID || "";



        dom.FormulaName.value =
            d.FormulaName || "";



        dom.VersionNo.value =
            d.VersionNo || "";



        dom.YieldQty.value =
            d.YieldQty ?? 0;



        dom.YieldUnit.value =
            d.YieldUnit || "";



        dom.IsActive.value =
            String(
                d.IsActive !== false
            );



        dom.Description.value =
            d.Description || "";



        dom.Remark.value =
            d.Remark || "";





        // 複製一份，避免修改到原始資料
        detailList =
            (d.Detail || []).map(x => ({ ...x }));



        renderDetail();




    }









    function renderDetail() {



        dom.formulaDetailList.innerHTML =
            "";




        detailList.forEach(
            (item, index) => {


                addMaterialRow(
                    item,
                    index
                );


            }
        );



    }









    function addMaterialRow(data = {}, index = null) {



        if (index === null) {


            detailList.push({

                MaterialID: "",

                MaterialCode: "",

                MaterialName: "",

                Quantity: 0,

                Unit: "",

                Remark: ""

            });



            index =
                detailList.length - 1;


        }






        const item =
            detailList[index];





        const tr =
            document.createElement(
                "tr"
            );



        tr.className =
            "formula-detail-row";



        tr.dataset.index =
            index;






        tr.innerHTML = `



            <td>


                <input

                    class="form-control material-name"

                    value="${App.esc(item.MaterialName || "")}"

                    data-field="MaterialName">


            </td>




            <td>


                <input

                    class="form-control"

                    value="${App.esc(item.MaterialCode || "")}"

                    data-field="MaterialCode">


            </td>





            <td>


                <input

                    type="number"

                    step="0.001"

                    class="form-control"

                    value="${item.Quantity || 0}"

                    data-field="Quantity">


            </td>





            <td>


                <input

                    class="form-control"

                    value="${App.esc(item.Unit || "")}"

                    data-field="Unit">


            </td>





            <td>


                <input

                    class="form-control"

                    value="${App.esc(item.Remark || "")}"

                    data-field="Remark">


            </td>






            <td>


                <button

                    type="button"

                    class="btn btn-danger btn-sm btn-remove-material">


                    ✖


                </button>


            </td>


        `;






        tr.querySelectorAll(
            "input"
        )
            .forEach(input => {


                input.addEventListener(
                    "change",
                    e => {


                        const field =
                            e.target.dataset.field;



                        detailList[index][field] =
                            e.target.value;



                    }
                );


            });






        tr.querySelector(
            ".btn-remove-material"
        )
            .addEventListener(
                "click",
                () => {


                    removeMaterialRow(
                        index
                    );


                }
            );





        dom.formulaDetailList.appendChild(
            tr
        );



    }









    function removeMaterialRow(index) {



        detailList.splice(
            index,
            1
        );



        renderDetail();



    }

    function buildPayload() {

        return {
            FormulaCode: dom.FormulaCode.value.trim(),
            ProductID: dom.ProductID.value.trim(),
            FormulaName: dom.FormulaName.value.trim(),
            VersionNo: dom.VersionNo.value.trim(),
            YieldQty: App.numOrNull(dom.YieldQty.value),
            YieldUnit: dom.YieldUnit.value.trim(),
            IsActive: dom.IsActive.value === "true",
            Description: dom.Description.value,
            Remark: dom.Remark.value
        };
    }

    function buildDetails() {

        return detailList
            .filter(x => x.MaterialName || x.MaterialCode || x.MaterialID)
            .map(x => ({
                MaterialID: x.MaterialID || "",
                MaterialCode: x.MaterialCode || "",
                MaterialName: x.MaterialName || "",
                Quantity: App.num(x.Quantity),
                Unit: x.Unit || "",
                Remark: x.Remark || ""
            }));
    }

    async function submitFormula() {

        const data = buildPayload();
        const details = buildDetails();

        if (!data.FormulaName) {
            alert("請輸入配方名稱");
            return;
        }

        try {

            if (mode === "create") {

                if (data.FormulaCode) {
                    const exists = (await API.list("Formula"))
                        .some(f => f.FormulaCode === data.FormulaCode);
                    if (exists) {
                        alert("⚠️ 配方編號已存在");
                        return;
                    }
                }

                // 第 0 個操作建立主檔，明細用 $0.FormulaID 取得新編號
                await API.batch([
                    { action: "insert", table: "Formula", data },
                    ...details.map(x => ({
                        action: "insert",
                        table: "FormulaDetail",
                        data: { ...x, FormulaID: "$0.FormulaID" }
                    }))
                ]);

                alert("🎉 配方建立成功");

            } else {

                const id = currentDetail.FormulaID;

                await API.batch([
                    { action: "update", table: "Formula", id, data },
                    { action: "removeWhere", table: "FormulaDetail", where: { FormulaID: id } },
                    ...details.map(x => ({
                        action: "insert",
                        table: "FormulaDetail",
                        data: { ...x, FormulaID: id }
                    }))
                ]);

                alert("✅ 配方修改成功");
            }

            openCreate(false);

            await searchFormula();

        }

        catch (err) {

            App.error(err, "儲存配方失敗");

        }

    }

    async function removeFormula() {

        if (!currentDetail?.FormulaID)
            return;

        if (!confirm("確認刪除此配方？"))
            return;

        try {

            await API.batch([
                { action: "removeWhere", table: "FormulaDetail", where: { FormulaID: currentDetail.FormulaID } },
                { action: "remove", table: "Formula", id: currentDetail.FormulaID }
            ]);

            alert("🗑️ 刪除完成");

            openCreate(false);

            await searchFormula();

        }

        catch (err) {

            App.error(err, "刪除失敗");

        }

    }

    function openCreate(scroll = true) {

        currentDetail = null;

        detailList = [];

        dom.form.reset();

        dom.IsActive.value = "true";

        dom.formulaDetailList.innerHTML = "";

        showForm();

        setModeUI("create");

        if (scroll)
            scrollToForm();

    }

    // 清除：回到新增模式
    function clearForm() {

        openCreate(false);

    }

    function showForm() {


        dom.formCard.classList.remove(
            "d-none"
        );


    }









    function hideForm() {


        dom.formCard.classList.add(
            "d-none"
        );


    }









    function scrollToForm() {


        setTimeout(() => {


            dom.formCard.scrollIntoView({

                behavior: "smooth",

                block: "start"

            });



        }, 100);



    }









    function setModeUI(newMode) {



        mode =
            newMode;






        if (
            mode === "create"
        ) {



            dom.editHint.classList.add(
                "d-none"
            );



            dom.btnCreate.disabled =
                false;



            dom.btnUpdate.disabled =
                true;



            dom.btnDelete.disabled =
                true;



        }



        else if (
            mode === "edit"
        ) {



            dom.editHint.classList.remove(
                "d-none"
            );



            dom.btnCreate.disabled =
                true;



            dom.btnUpdate.disabled =
                false;



            dom.btnDelete.disabled =
                false;



        }



        else {



            dom.editHint.classList.add(
                "d-none"
            );



            dom.btnCreate.disabled =
                true;



            dom.btnUpdate.disabled =
                true;



            dom.btnDelete.disabled =
                true;



        }



    }









    return {


        init,


        openCreate


    };



})();