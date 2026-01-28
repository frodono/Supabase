function addPanel(id) {
    const $centerContainer = $("#center-container");
    $centerContainer.append(`
            <div id="panel_${id}" class="panel"></div>
        `);
}

// Funzione per creare la lista di checkbox
function renderCheckboxList(panelIds) {
    const $checkboxList = $("#checkbox-list");
    $checkboxList.empty();
    panelIds.forEach((id) => {
        const $checkBox = $("<div>").dxCheckBox({
            value: true,
            text: id,
            onValueChanged: function (e) {
                $(`#panel_${id}`).toggle(e.value);
            },
        });
        const $listItem = $("<div>").addClass("sortable-item").append($checkBox);
        $checkboxList.append($listItem);
    });

    // Abilita il riordino dei checkbox
    // $checkboxList.dxSortable({
    //     filter: ".sortable-item",
    //     moveItemOnDrop: true,
    //     onReorder: function (e) {
    //         const reorderedIds = $checkboxList
    //             .find(".sortable-item")
    //             .map(function () {
    //                 return $(this).find(".dx-checkbox").dxCheckBox("instance").option("text");
    //             })
    //             .get();

    //         // Aggiorna l'ordine dei pannelli in base al riordino
    //         panelIds.splice(0, panelIds.length, ...reorderedIds);
    //         renderPanels();
    //     },
    // });
}

function buildPanels(panelIds) {

    const $checkboxList = $("#checkbox-list");
    const $centerContainer = $("#center-container");

    // Funzione per creare i pannelli centrali
    function renderPanels() {
        $centerContainer.find("div:not(#top-splitter)").remove();
        panelIds.forEach((id) => {
            $centerContainer.append(`
                <div id="panel_${id}" class="panel"></div>
            `);
        });
    }




    renderCheckboxList();
    renderPanels();
}
