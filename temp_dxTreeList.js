document.addEventListener('DOMContentLoaded', async () => {
    const button = document.getElementById('addDimension');
    const container = document.getElementById('divContainer');
    const dims = await getDimensions(project)

    const splitterId = `main_splitter`;
    const panels = getPanels(dims)

    const splitter = document.createElement('div')
    splitter.id = splitterId

    container.append(splitter);

    const spl = $("#" + splitterId).dxSplitter({
        height: "100%",
        width: "100%",
        orientation: "horizontal",
        panels: panels
    });



    dims.forEach(dim => {
        addDimension(dim.dim)
    });
    // treeList("trConti", "Conti")
    // treeList("trRendiconto", "Rendiconto")

    // Add click event listener
    button.addEventListener('click', function () {
        // Create a new divider element
        const newDimName = document.getElementById('newDimName').value;
        addDimension(newDimName)
    });
})

function addDimension(dimName) {
    dims.push(dimName)
    splitter = $(`#${splitterId}`).dxSplitter("instance")
    const newPanels = getPanels(dims)
    splitter.panels = newPanels
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
        console.log(data)
        return data;
    };
    return await fetchData()
}

function getPanels(dims) {
    return dims.map((dim, index) => ({
        size: `${100 / dims.length}%`, // Divisione uniforme
        contentTemplate: `${dim}_main` // ID dinamico per il contenitore
    }));

}