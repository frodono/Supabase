document.addEventListener('DOMContentLoaded', async () => {
    const button = document.getElementById('addDimension');
    const buttonGrid = document.getElementById('swapGrid');
    const container = document.getElementById('divContainer');
    window.dims = await getDimensions(project)
    window.Filter = false
    window.linkMode = false
    const panelIds = window.dims.map(dim => dim.dim).sort();
    renderCheckboxList(panelIds)
    // buildPanels(panelIds)

    panelIds.forEach(dim => {
        addDimension(dim)
    });
    // treeList("trConti", "Conti")
    // treeList("trRendiconto", "Rendiconto")

    // Add click event listener
    button.addEventListener('click', function () {
        // Create a new divider element
        const newDimName = document.getElementById('newDimName').value;
        addDimension(newDimName, container)
    });

    buttonGrid.addEventListener('click', function () {
        const panels = document.querySelectorAll('.panel');
        panels.forEach(panel => {
            if (panel.style.width == '40%') {
                panel.style.width = '100%';
            } else {
                panel.style.width = '40%';
            }
        })
    });

    //edit mode
    const $checkBox = $("#editMode").dxCheckBox({
        value: false,
        text: "Abilita Modifiche",
        onValueChanged: function (e) {
            panelIds.forEach(dim => {
                enableEdit(dim, e.value)
            });
        },
    });

    //Filter button
    const buttonFilter = document.getElementById('filter');
    buttonFilter.innerHTML = "Attiva Filtro"
    buttonFilter.addEventListener('click', function (e) {
        Filter = !Filter
        buttonFilter.innerText = Filter ? "Disattiva Filtro" : "Attiva Filtro"
        if (!Filter) removeFilters()
    });
    //Mode button
    const buttonMode = document.getElementById('mode');
    buttonMode.innerHTML = "Copia"
    buttonMode.addEventListener('click', function (e) {
        linkMode = !linkMode
        buttonMode.innerText = linkMode ? "Collega" : "Copia"
    });
    //back button
    const backButton = document.getElementById('back');
    backButton.addEventListener('click', function (e) {
        history_backward()
    });
    //forward button
    const forewardButton = document.getElementById('foreward');
    forewardButton.addEventListener('click', function (e) {
        history_foreward()
    });

    // const drawer = $('#left-splitter').dxDrawer({
    //     revealMode: 'expand',
    //     openedStateMode:"push",
    //     opened: true,
    //     height: 800,
    //     closeOnOutsideClick: true,
    //   }).dxDrawer('instance');

    //   $('#toolbar').dxToolbar({
    //     items: [{
    //       widget: 'dxButton',
    //       location: 'before',
    //       options: {
    //         icon: 'menu',
    //         stylingMode: 'text',
    //         onClick() {
    //           drawer.toggle();
    //         },
    //       },
    //     }],
    //   });

})

async function history_foreward() {
    const { data: result, error: schemaError } = await supabaseClient
        .rpc('history_foreward', { project_name: project });

    if (schemaError) {
        console.error("Error fetching table schema:", schemaError);
        return;
    }
    refreshTreeList()
}

async function history_backward() {
    const { data: result, error: schemaError } = await supabaseClient
        .rpc('history_backward', { project_name: project });

    if (schemaError) {
        console.error("Error fetching table schema:", schemaError);
        return;
    }
    refreshTreeList()
}

function refreshTreeList() {
    dims.forEach(dim => {
        const trl = $("#" + dim.dim).dxTreeList("instance")
        trl.refresh();
    });

}
function removeFilters() {
    dims.forEach(dim => {
        const trl = $("#" + dim.dim).dxTreeList("instance")
        trl.clearFilter()
    })
}

function enableEdit(dimName, enable) {
    $("#" + dimName).dxTreeList("option", "editing", {
        mode: "batch",  // oppure 'batch', 'cell', etc.
        allowUpdating: enable,
        allowAdding: enable,
        allowDeleting: enable
    });
    $("#" + dimName).dxTreeList("option", "rowDragging", {
        allowReordering: enable,
        allowDropInsideItem: enable
    });


}


function addDimension(dimName) {
    addPanel(dimName)
    displayFilter = dimName == "Conti" ? true : false
    treeList(project, dimName, displayFilter)
}

async function getDimensions(project) {
    const fetchData = async () => {
        const { data, error } = await supabaseClient
            .rpc('get_dims', { project: project });
        if (error) {
            console.log('Error fetching data:', error);
            return [];
        }
        return data;
    };
    return await fetchData()
}

