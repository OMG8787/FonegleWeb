window.Pages = window.Pages || {};

Pages.ToolAgent = (() => {

    "use strict";

    const dom = {};

    //==========================
    // INIT
    //==========================
    function init() {

        cacheDom();
        bindEvents();

        renderImage();

    }

    //==========================
    // DOM
    //==========================
    function cacheDom() {

        dom.menu = document.getElementById("agentMenu");

        dom.content = document.getElementById("agentContent");

        dom.title = document.getElementById("agentTitle");

        dom.subTitle = document.getElementById("agentSubTitle");

    }

    //==========================
    // EVENTS
    //==========================
    function bindEvents() {

        dom.menu
            .querySelectorAll("[data-page]")
            .forEach(btn => {

                btn.addEventListener("click", () => {

                    if (btn.classList.contains("disabled"))
                        return;

                    changeMenu(btn);

                });

            });

    }

    //==========================
    // MENU
    //==========================
    function changeMenu(btn) {

        dom.menu
            .querySelectorAll("[data-page]")
            .forEach(x => x.classList.remove("active"));

        btn.classList.add("active");

        const page = btn.dataset.page;

        switch (page) {

            case "image":
                renderImage();
                break;

            case "article":
                renderArticle();
                break;

            case "meeting":
                renderMeeting();
                break;

        }

    }

    //==========================
    // 圖片生成
    //==========================
    function renderImage() {

        dom.title.innerHTML = "🖼️ 圖片生成";

        dom.subTitle.innerHTML = "使用 AI 快速建立圖片";

        dom.content.innerHTML = `

<div class="mb-3">

<label class="form-label">

圖片主題

</label>

<input
id="imageTopic"
class="form-control"
placeholder="例如：夏季冰淇淋海報">

</div>

<div class="mb-3">

<label class="form-label">

圖片提示詞

</label>

<textarea
id="imagePrompt"
class="form-control"
rows="3"></textarea>

</div>

<div class="mb-3">

<label class="form-label">

圖片細節

</label>

<textarea
id="imageDetail"
class="form-control"
rows="5"></textarea>

</div>

<div class="row">

<div class="col-md-6">

<label class="form-label">

風格

</label>

<select
id="imageStyle"
class="form-select">

<option>真實攝影</option>
<option>產品攝影</option>
<option>插畫</option>
<option>動漫</option>
<option>3D</option>
<option>水彩</option>
<option>像素風</option>

</select>

</div>

<div class="col-md-6">

<label class="form-label">

圖片比例

</label>

<select
id="imageRatio"
class="form-select">

<option>1:1</option>
<option>16:9</option>
<option>9:16</option>
<option>4:5</option>

</select>

</div>

</div>

<button
id="btnGenerateImage"
class="btn btn-primary w-100 mt-4">

🖼️ 開始生成圖片

</button>

`;

        document
            .getElementById("btnGenerateImage")
            ?.addEventListener("click", generateImage);

    }

    //==========================
    // 文案生成
    //==========================
    function renderArticle() {

        dom.title.innerHTML = "✍️ 文案生成";

        dom.subTitle.innerHTML = "快速建立品牌文案";

        dom.content.innerHTML = `

<div class="mb-3">

<label class="form-label">

文案主題

</label>

<input
id="articleTopic"
class="form-control">

</div>

<div class="mb-3">

<label class="form-label">

用途說明

</label>

<textarea
id="articleDescription"
class="form-control"
rows="3"></textarea>

</div>

<div class="mb-3">

<label class="form-label">

細節需求

</label>

<textarea
id="articleDetail"
class="form-control"
rows="5"></textarea>

</div>

<div class="row">

<div class="col-md-6">

<label class="form-label">

風格

</label>

<select
id="articleStyle"
class="form-select">

<option>活潑</option>
<option>正式</option>
<option>品牌感</option>
<option>故事型</option>

</select>

</div>

<div class="col-md-6">

<label class="form-label">

字數

</label>

<select
id="articleLength"
class="form-select">

<option>100字</option>
<option>300字</option>
<option>500字</option>
<option>不限</option>

</select>

</div>

</div>

<button
id="btnGenerateArticle"
class="btn btn-success w-100 mt-4">

✍️ 開始生成文案

</button>

`;

        document
            .getElementById("btnGenerateArticle")
            ?.addEventListener("click", generateArticle);

    }

    //==========================
    // 會議代理
    //==========================
    function renderMeeting() {

        dom.title.innerHTML = "🎙️ 會議代理";

        dom.subTitle.innerHTML = "加入線上會議並自動整理";

        dom.content.innerHTML = `

<div class="mb-3">

<label class="form-label">

會議網址

</label>

<input
id="meetingUrl"
class="form-control"
placeholder="https://">

</div>

<div class="row">

<div class="col-md-6">

<label class="form-label">

平台

</label>

<select
id="meetingPlatform"
class="form-select">

<option>Google Meet</option>
<option>Microsoft Teams</option>
<option>Zoom</option>
<option>Discord</option>

</select>

</div>

<div class="col-md-6">

<label class="form-label">

代理人

</label>

<select
id="meetingAgent"
class="form-select">

<option>Meeting Agent</option>

</select>

</div>

</div>

<div class="mt-3">

<label class="form-label">

需求說明

</label>

<textarea
id="meetingPrompt"
class="form-control"
rows="5"></textarea>

</div>

<div class="form-check mt-3">

<input
class="form-check-input"
type="checkbox"
checked
id="meetingSummary">

<label
class="form-check-label">

產生摘要

</label>

</div>

<div class="form-check">

<input
class="form-check-input"
type="checkbox"
checked
id="meetingTodo">

<label
class="form-check-label">

整理待辦事項

</label>

</div>

<div class="form-check">

<input
class="form-check-input"
type="checkbox"
id="meetingEmail">

<label
class="form-check-label">

Email通知

</label>

</div>

<button
id="btnMeeting"
class="btn btn-danger w-100 mt-4">

🎙️ 加入會議

</button>

`;

        document
            .getElementById("btnMeeting")
            ?.addEventListener("click", joinMeeting);

    }

    //==========================
    // API
    //==========================
    async function generateImage() {

        alert("圖片生成 API 尚未串接");

        // const cmd = "";
        // const res = await API.send(cmd);

    }

    async function generateArticle() {

        alert("文案生成 API 尚未串接");

    }

    async function joinMeeting() {

        alert("會議代理 API 尚未串接");

    }

    //==========================
    // Return
    //==========================
    return {

        init

    };

})();