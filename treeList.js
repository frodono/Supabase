
async function treeList(projectName, dimName, displayFilter = false) {
    const container = dimName
    // Fetch data from Supabase
    var data, link
    async function insertLink(linkData, projectName) {
        const tableName = projectName + "_link"
        const { error: insertError } = await supabaseClient.from(tableName).insert(linkData);
        if (insertError) {
            console.error("Error inserting data:", insertError);
        } else {
        }
    }

    function sortDataByParentChildRelationship(data) {
        // Step 1: Build a map of rows by ID
        const rowMap = new Map();
        data.forEach(row => rowMap.set(row.id, row));

        // Step 2: Build a graph representing the parent-child relationships
        const graph = new Map();
        const inDegree = new Map();

        data.forEach(row => {
            const pid = row.pid || null;

            // Initialize graph and inDegree maps
            if (!graph.has(row.id)) graph.set(row.id, []);
            if (!inDegree.has(row.id)) inDegree.set(row.id, 0);

            if (pid !== null) {
                if (!graph.has(pid)) graph.set(pid, []);
                graph.get(pid).push(row.id);
                inDegree.set(row.id, (inDegree.get(row.id) || 0) + 1);
            }
        });

        // Step 3: Perform topological sort
        const sorted = [];
        const queue = [];

        // Enqueue nodes with no dependencies
        for (const [id, degree] of inDegree.entries()) {
            if (degree === 0) queue.push(id);
        }

        while (queue.length > 0) {
            const id = queue.shift();
            sorted.push(rowMap.get(id));

            for (const childId of graph.get(id)) {
                inDegree.set(childId, inDegree.get(childId) - 1);
                if (inDegree.get(childId) === 0) queue.push(childId);
            }
        }

        // Step 4: Check for cycles
        if (sorted.length !== data.length) {
            // throw new Error("Cycle detected in parent-child relationships.");
        }

        return sorted;
    }

    async function processAndInsertData(dataToProcess, tableName, main_pid = null) {

        var msgText = "", recCount = 0, dataType
        //Step 1: Colonne esistenti
        const { data: columns, error: schemaError } = await supabaseClient
            .rpc('get_table_columns', { tab_name: tableName });

        if (schemaError) {
            console.error("Error fetching table schema:", schemaError);
            return;
        }
        const schemaColumns = columns.map(col => col.col_names);


        // Step 2: Parse the pasted data
        var originalData
        var headers

        const isJsonData = isJsonObjectOrArray(dataToProcess)
        if (isJsonData) {
            originalData = castArray(dataToProcess)
            dataType = "Nodi"
            headers = Object.keys(Object.values(originalData)[0])
        } else {
            // const rows = dataToProcess.trim().split("\n");
            const rows = dataToProcess.replace(/\r/g, "").trim().split('\n').map(row => row.split('\t'))
            headers = rows.splice(0, 1)[0]
            if (!headers.includes("pid")) {
                //multilevel: crea OriginalData con id, pid, text
                dataType = "Multilevel"
                originalData = []
                let idCounter = 1;
                rows.forEach(row => {
                    let pid = null;
                    row.forEach((cell, level) => {
                        if (cell.trim()) {
                            // Cerca se esiste già nella gerarchia
                            let existingNode = originalData.find(item => item.text === cell && item.level === level);
                            if (!existingNode) {
                                // Aggiungi nuovo nodo
                                existingNode = { id: idCounter++, text: cell, level, pid };
                                originalData.push(existingNode);
                            }
                            pid = existingNode.id; // Il pid diventa l'ID del nodo attuale
                        }
                    });
                });
                msgText = " delle colonne: " + headers.join(",")
                headers = ["id", "pid", "text"]
            } else {
                dataType = "Parent-Child"
                headers = headers.filter(header => schemaColumns.includes(header));
                originalData = rows.map(row => {
                    return headers.reduce((obj, header, index) => {
                        obj[header] = isNaN(row[index]) ? row[index] : +row[index];
                        return obj;
                    }, {});
                });
            }
            originalData = filterPropertiesArray(originalData, schemaColumns)
            try {
                originalData = sortDataByParentChildRelationship(originalData);
            } catch (error) {
                console.error(error.message);
            }

        }
        recCount = originalData.length

        // Step 3: Validate minimum required fields
        const requiredFields = ["id", "pid", "text"];
        for (const field of requiredFields) {
            if (!headers.includes(field)) {
                throw new Error(`Missing required field: ${field}`);
            }
        }

        const msg = "Inserire " + recCount + " elementi " + msgText + " di tipo " + dataType + " ?"
        if (!confirm(msg)) return

        // Step 4: Identify and add missing columns
        // const newColumns = headers.filter(header => !schemaColumns.includes(header));
        // for (const column of newColumns) {
        //     const { error: alterError } = await supabaseClient.rpc('add_column_to_table', {
        //         table_name: tableName,
        //         column_name: column,
        //         column_type: 'text' // Adjust type based on your data
        //     });

        //     if (alterError) {
        //         console.error(`Error adding column "${column}":`, alterError);
        //         return;
        //     }
        // }

        // Step 5: Fetch the existing maximum ID from the destination table
        const { data: maxIdData, error: fetchError } = await supabaseClient
            .from(tableName)
            .select('id')
            .order('id', { ascending: false })
            .limit(1);

        if (fetchError) {
            console.error("Error fetching maximum ID:", fetchError);
            return;
        }

        const currentMaxId = maxIdData.length > 0 ? maxIdData[0].id : 0;
        let nextId = currentMaxId + 1;

        // Step 6: Rebuild `id` and `pid` and dim
        const idMap = {}; // Map old IDs to new IDs
        const rebuiltData = originalData.map(row => {
            const newId = nextId++;
            idMap[row.id] = newId; // Map old ID to new ID

            return {
                ...row,
                id: newId,
                pid: isJsonData ? row.pid : (row.pid && idMap[row.pid] ? idMap[row.pid] : main_pid),
                codice: row.codice ? row.codice : row.text,
                dim: dimName
            };
        });

        // Step 7: Insert the rebuilt data into the destination table
        const { error: insertError } = await supabaseClient.from(tableName).insert(rebuiltData);
        if (insertError) {
            console.error("Error inserting data:", insertError);
        } else {
            console.log("Data inserted successfully!");
        }

        //Step 8: Aggiorna
        treeList.refresh();

    }

    function isJsonObjectOrArray(variable) {
        return (typeof variable === "object" && variable !== null) || Array.isArray(variable);
    }

    function castArray(variable) {
        let objArray = []
        if (Array.isArray(variable)) {
            objArray = variable
        } else {
            if (typeof variable === "object" && variable !== null) {
                objArray.push(variable)
            } else {
                objArray = []
            }
        }
        if (objArray[0].data) {
            objArray = objArray.map(obj => obj.data)
        }
        return objArray
    }

    function filterPropertiesArray(obj, keys) {
        obj = castArray(obj)
        return obj.map(item => {
            return keys.reduce((filteredObj, key) => {
                if (key in item) {
                    filteredObj[key] = item[key];
                }
                return filteredObj;
            }, {});
        });
    }

    const fetchData = async () => {
        const { data, error } = await supabaseClient
            .from(projectName)
            .select('*')
            .eq("dim", dimName)
            .or('deleted.is.null,deleted.eq.false')
        if (error) {
            console.log('Error fetching data:', error);
            return [];
        }
        data.sort((a, b) => a.ordine - b.ordine);
        // maxId = Math.max(...data.map(item => item.id));

        link = await fetchLink()

        const countById = link.reduce((acc, l) => {
            if (l.target_id == 545 && l.source_dim == "Processi") {
                // debugger
            }
            // source_id
            acc[l.source_id] = acc[l.source_id] || { source: 0, OUT: 0, target: 0, IN: 0 };
            acc[l.source_id].source++;
            acc[l.source_id].OUT += l.source_leaves > 0 ? l.source_leaves : 1;
            acc[l.source_id].IN += l.target_leaves;

            // target_id
            acc[l.target_id] = acc[l.target_id] || { source: 0, OUT: 0, target: 0, IN: 0 };
            acc[l.target_id].target++;
            acc[l.target_id].OUT += l.source_leaves || 1
            acc[l.target_id].IN += l.target_leaves;

            return acc;
        }, {});

        const data_link = data.map(d => {
            const counts = countById[d.id] || { source: 0, OUT: 0, target: 0, IN: 0 };
            const nLinks = counts.source + counts.target
            const nLeavesOUT = counts.OUT || 1
            const nLeavesIN = counts.IN || 1
            const moreLeaves = nLeavesIN > 1 || nLeavesOUT > 1

            return {
                ...d,
                LINKS: nLinks + (moreLeaves ? (" (" + nLeavesOUT + " > " + nLeavesIN + ")") : "")
            };
        });

        return data_link;
    };
    function getMyData() {
        return data
    }

    const fetchLink = async () => {
        const { data, error } = await supabaseClient
            .from(projectName + "_link_names")
            .select('*')
            .or('deleted.is.null,deleted.eq.false')
        if (error) {
            console.log('Error fetching data:', error);
            return [];
        }
        sources = new Set(data.map(e => e.source_id));
        targets = new Set(data.map(e => e.target_id));
        return data;
    };

    // CRUD operations
    const insertRow = async (row) => {
        // maxId += 1
        // row.id = maxId
        delete row.__KEY__
        row.dim = dimName
        const { data, error } = await supabaseClient
            .from(projectName)
            .insert([row]);
        if (error) console.log('Insert Error:', error);
        await refreshMe()
        return data;

    };

    const updateRow = async (key, row) => {
        const { data, error } = await supabaseClient
            .from(projectName)
            .update(row)
            .eq('id', key);
        if (error) console.log('Update Error:', error);
        await refreshMe()
        return data;
    };

    const deleteRow = async (key) => {
        // VEDI: onRowRemoving

        //ELIMINIZIONE DEFINITIVA
        // const { data, error } = await supabaseClient
        //     .from(projectName)
        //     .delete()
        //     .eq('id', key);
        // if (error) console.log('Delete Error:', error);
        // return data;
    };

    // Initialize dxTreeList
    var columns = [
        { dataField: 'text', caption: 'Name', width: 800 },
        { dataField: 'id', caption: 'ID', width: 70, visible: false },
        { dataField: 'pid', caption: 'Parent ID', width: 200, visible: false },
        { dataField: 'ordine', caption: 'Ordine', width: 20, visible: false },
        {
            dataField: 'dummy',
            caption: "Elimina",
            width: 50,
            cellTemplate: function (container, options) {
                const id = options.data.id;
                const isSource = sources.has(id);
                const isTarget = targets.has(id);

                // aggiungiamo l'icona X solo se nodo colorato
                if (linkMode && (isSource || isTarget)) {
                    $("<div>")
                        .addClass("icon-x")
                        .text("X")
                        .appendTo(container)
                        .on("click", async function (e) {
                            if (!confirm("Eliminare il collegamento")) return
                            if (isSource) deleteLink(id, "source_id")
                            if (isTarget) deleteLink(id, "target_id")
                            await refreshMe()
                            sourceTreelist = e.fromComponent
                            // sourceTreelist.reloadTree()

                        });
                }
                $(container).addClass("dx-treelist-action-cell");
            }
        },
        // { dataField: 'deleted', caption: 'Eliminasto', width: 20, visible: false }
    ]
    skipColumns = ["deleted", "dim", "audit_id", "ref_id", "skip_audit"]
    data = await fetchData()

    if (data.length > 0) {
        const fixedColumns = columns.map(col => col.dataField);
        const allColumns = Object.keys(data[0])
        const otherColumns = allColumns.filter(item => !fixedColumns.includes(item) && !skipColumns.includes(item)).map(field => ({ dataField: field, visible: false, caption: field.replace("_", " ").toUpperCase() }));
        columns.push(...otherColumns)
    }
    const buttonColumn = { type: "buttons", buttons: ["add", "edit", "delete"] }
    // columns.push(buttonColumn)
    //Main Container
    const panelContainer = document.getElementById("panel_" + dimName)
    const mainContainer = document.createElement('div')
    mainContainer.id = dimName + "_main"
    mainContainer.className = "main_container"
    // $("#divContainer").append(mainContainer)
    panelContainer.append(mainContainer)
    mainContainer.addEventListener('paste', function (e) {
        let pastedData = e.clipboardData.getData('text');
        const rowKey = treeList.getSelectedRowKeys()[0]
        // let htmlText = e.clipboardData.getData('text/html');
        // console.log('HTML Text:', htmlText);
        processAndInsertData(pastedData, projectName, rowKey);
        // Process and handle pastedData here
    });

    // dim label
    const dividerDimName = document.createElement('div')
    dividerDimName.id = dimName + "_label"
    dividerDimName.innerHTML = dimName
    mainContainer.append(dividerDimName)

    //treeList Container
    const div = document.createElement('div')
    div.id = dimName
    mainContainer.append(div)

    //Build TreeList
    const treeList = $("#" + dimName).dxTreeList({
        dataSource: new DevExpress.data.CustomStore({
            key: "id",
            load: getMyData,
            insert: async (values) => await insertRow(values),
            update: async (key, values) => await updateRow(key, values),
            remove: async (key) => await deleteRow(key),
        }),
        keyExpr: 'id',
        parentIdExpr: 'pid',
        columns: columns,
        showBorders: true,
        focusedRowEnabled: true,
        headerFilter: {
            visible: true,
            allowSelectAll: false,
            search: {
                enabled: true,
            },
        },
        columnAutoWidth: true,
        searchPanel: {
            visible: true,
        },
        editing: {
            mode: 'none',
            allowUpdating: false,
            allowAdding: false,
            allowDeleting: false,
        },
        columnChooser: {
            enabled: true,
            mode: "select", // "select" o "dragAndDrop"
            title: "Scegli le colonne",
            emptyPanelText: "Trascina qui le colonne per nasconderle"
        },
        sorting: {
            mode: 'multiple', // simple multiple
        },
        allowColumnReordering: true, // Consente il riordino delle colonne
        expandNodesRecursive: true,
        allowColumnResizing: true,
        showCheckBoxesMode: "normal",
        selection: {
            mode: "single", // multiple normal single
        },
        onCellPrepared: function (e) {
            if (!linkMode) return
            // Applichiamo solo alle righe dati
            if (e.rowType !== "data") return;
            if (!e.data) return;
            if (!e.cellElement) return;

            formatLinkElement(e)
        },
        onRowClick: function (e) {
            let clickedElement = $(e.event.target)
            if (!e.component.option("rowDragging.allowReordering")) {
                let treeList = e.component;
                let rowKey = e.key;

                // Controlla se il nodo è già espanso
                let isExpanded = treeList.isRowExpanded(rowKey);
                if (clickedElement.closest(".dx-treelist-expander").length) {
                    isExpanded = !isExpanded
                }
                // Espande o contrae il nodo in base allo stato attuale
                if (isExpanded) {
                    treeList.collapseRow(rowKey);
                } else {
                    treeList.expandRow(rowKey);
                }
            }

            // e.component.selectRows([e.key], false);
            // const selectedRows = e.component.getSelectedRowKeys();
            // if (selectedRows.includes(e.key)) {
            //     // Deseleziona il nodo se è già selezionato
            //     e.component.clearSelection();
            //     e.event.preventDefault();
            //     // const treeList2 = $("#Rendiconto").dxTreeList("instance");
            //     // treeList2.clearFilter();
            // } else {
            //     // Seleziona il nodo normalmente
            //     e.component.selectRows([e.key], false);
            // }
            const selectedNode = e.component.getSelectedRowsData()[0];
            if (Filter && selectedNode) {
                const nodeId = selectedNode.id;
                let codes = []
                if (!linkMode) {
                    codes = collectDescendantCodes(selectedNode, data);
                    dims.forEach(dim => {
                        modelDim = dim.dim
                        const trl = $("#" + modelDim).dxTreeList("instance")
                        if (modelDim != dimName) {
                            trl.filter(item => codes.includes(item.codice) || codes.includes(item.coorigine));
                            trl.repaint();
                        } else {
                            trl.clearFilter()
                            trl.repaint();
                        }
                    })
                } else {
                    codes = collectDescendantIDs(selectedNode, data);
                    dims.forEach(dim => {
                        modelDim = dim.dim
                        const trl = $("#" + modelDim).dxTreeList("instance")
                        if (modelDim != dimName) {
                            trl.filter(item => codes.includes(item.id));
                            trl.repaint();
                        } else {
                            trl.clearFilter()
                            trl.repaint();
                        }
                    })
                }
                // simulateSearch(treeList2, codes)
                // simulateSearchAndExpand(treeList2,codes)
            }
        },
        onSelectionChanged: function (e) {
        },
        onRowRemoving: async function (e) {
            const treeList = e.component; // Reference to the dxTreeList instance
            const nodeKey = e.key; // The key of the node being deleted
            const node = treeList.getNodeByKey(nodeKey);
            const nodeIdsToDelete = [];
            function collectDescendants(node) {
                nodeIdsToDelete.push(node.key); // Add the current node
                node.children.forEach(collectDescendants); // Recursively add children
            }
            collectDescendants(node)
            await deleteRows(nodeIdsToDelete)
            // e.component.getDataSource().reload();
            await refreshMe()
        },
        rowDragging: {
            group: "treeGroup",
            allowReordering: false,
            dropFeedbackMode: "indicate",
            allowDropInsideItem: false,
            showDragIcons: false,     // Displays drag handles
            onDragStart: function (e) {
                if (!e.component.option("rowDragging.allowReordering")) {
                    e.cancel = true; // Disabilita il drag se allowReordering è false
                }
                const nodeData = e.component.getNodeByKey(e.itemData.id);
                // e.dataTransfer.setData("nodeData", JSON.stringify(nodeData));

                const treeList = e.component;
                const selectedRowKeys = treeList.getSelectedRowKeys();

                // Recupera i dati dei nodi selezionati
                const selectedData = selectedRowKeys.map(key =>
                    treeList.getDataSource().items().find(item => item.key === key)
                );
                // Imposta i dati selezionati come elemento trascinato
                e.itemData = nodeData;
            },
            onAdd: async function (e) {
                console.log("drag-onAdd")
                // var targetData = []
                //FUNZIONE PER COPIARE I NODI SULLA TREELIST
                // const targetTreeList = e.component;
                // targetData = targetTreeList.getDataSource().items()
                // // Copia i dati trascinati
                // e.itemData.forEach(item => {
                //     const copiedItem = { ...item, dim: dimName };
                //     targetData.push(copiedItem);
                // });

                // // Aggiorna i dati della TreeList di destinazione
                // targetTreeList.option("dataSource", targetData);

                // const item = JSON.parse(e.dataTransfer.getData("nodeData"));

                if (linkMode && interDim(e) && e.dropInsideItem) {
                    const source_id = e.itemData.key
                    const target_id = e.toComponent.getVisibleRows()[e.toIndex].data.id
                    const linkData = { source_id: source_id, target_id: target_id }
                    insertLink(linkData, projectName)

                    // const trl_source = $("#" + e.fromComponent._$element[0].id).dxTreeList("instance")
                    // trl_source.reloadTree(trl_source)
                    // const trl_dest = $("#" + e.toComponent._$element[0].id).dxTreeList("instance")
                    // trl_dest.reloadTree(trl_dest)

                } else if (!linkMode) {
                    toComponentRow = e.toComponent.getVisibleRows()[e.toIndex].data
                    var newPid
                    if (e.dropInsideItem) {
                        newPid = toComponentRow.id
                    } else {
                        newPid = toComponentRow.pid
                    }
                    const cn = JSON.parse(JSON.stringify(e.itemData.data))
                    const copiedItem = { ...cn, pid: newPid, dim: dimName, ref_id: cn.id };
                    processAndInsertData(copiedItem, projectName)
                }
                await refreshMe()

                // if (e.itemData.length) {
                //     e.itemData.forEach(item => {
                //         const copiedItem = { ...item.data, dim: dimName, ref_id: item.data.id };
                //         targetData.push(copiedItem);
                //     });
                //     processAndInsertData(targetData, projectName)
                // }
            },
            onDragEnd: async function (e) {
                console.log("onDragEnd")
                if (!interDim(e)) await updateNode(e)
                await refreshMe()
            },
            onDragChange: function (e) {
                // console.log("onDragChange")
                // Optional: Highlight valid drop targets
            },
            onReorder: async function (e) {
                console.log("onReorder")
                // updateNode(e)
            }
        },
        toolbar: {
            items: [
                {
                    widget: 'dxButton',
                    locateInMenu: 'auto',
                    title: 'Export Excel',
                    options: {
                        icon: 'xlsxfile',
                        onClick: exportToExcel
                    }
                },
                {
                    widget: 'dxButton',
                    locateInMenu: 'auto',
                    title: 'Aggiorna',
                    options: {
                        icon: 'refresh',
                        onClick: await refreshMe
                    }
                },
                'columnChooserButton',
                'saveButton',
                'addRowButton',
                'searchPanel'
            ]
        }

    }).dxTreeList('instance');
    treeList.repaint();

    function exportToExcel() {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(dimName);

        exportTreeList({
            component: treeList,
            worksheet,
        }).then(() => {
            workbook.xlsx.writeBuffer().then((buffer) => {
                saveAs(new Blob([buffer], { type: 'application/octet-stream' }), dimName + '.xlsx');
            });
        });
    }
    const MIN_COLUMN_WIDTH = 10;
    const PIXELS_PER_INDENT = 10;
    const PIXELS_PER_EXCEL_WIDTH_UNIT = 8;
    const CELL_PADDING = 2;

    class TreeListHelpers {
        constructor(component, worksheet, options) {
            this.component = component;
            this.worksheet = worksheet;
            this.columns = this.component.getVisibleColumns();
            this.dateColumns = this.columns.filter(
                (column) => column.dataType === 'date' || column.dataType === 'datetime',
            );
            this.lookupColumns = this.columns.filter((column) => column.lookup !== undefined);

            this.rootValue = this.component.option('rootValue');
            this.parentIdExpr = this.component.option('parentIdExpr');
            this.keyExpr = this.component.option('keyExpr') ?? this.component.getDataSource().key();
            this.dataStructure = this.component.option('dataStructure');

            this.worksheet.properties.outlineProperties = {
                summaryBelow: false,
                summaryRight: false,
            };
        }

        getData() {
            return this.component
                .getDataSource()
                .store()
                .load()
                .then((result) => this.processData(result));
        }

        processData(data) {
            let rows = data;
            if (this.dataStructure === 'plain') rows = this.convertToHierarchical(rows);
            return this.depthDecorator(rows);
        }

        // adds the depth for hierarchical data
        depthDecorator(data, depth = 0) {
            const result = [];

            data.forEach((node) => {
                result.push({
                    ...node,
                    depth,
                    items: this.depthDecorator(node.items ?? [], depth + 1),
                });
            });

            return result;
        }

        // converts plain to hierarchical
        convertToHierarchical(data, id = this.rootValue) {
            const result = [];
            const roots = [];

            data.forEach((node) => {
                if (node[this.parentIdExpr] === id) roots.push(node);
            });

            roots.forEach((node) => {
                result.push({
                    ...node,
                    items: this.convertToHierarchical(data, node[this.keyExpr]),
                });
            });

            return result;
        }

        exportRows(rows) {
            rows.forEach((row) => {
                this.exportRow(row);

                if (this.hasChildren(row)) this.exportRows(row.items);
            });
        }

        exportRow(row) {
            this.formatDates(row);
            this.assignLookupText(row);

            const insertedRow = this.worksheet.addRow(row);
            insertedRow.outlineLevel = row.depth;
            this.worksheet.getCell(`A${insertedRow.number}`).alignment = {
                indent: row.depth * 2,
            };
        }

        formatDates(row) {
            this.dateColumns.forEach((column) => {
                row[column.dataField] = new Date(row[column.dataField]);
            });
        }

        assignLookupText(row) {
            this.lookupColumns.forEach((column) => {
                row[column.dataField] = column.lookup.calculateCellValue(row[column.dataField]);
            });
        }

        generateColumns() {
            this.worksheet.columns = this.columns.map(({ caption, dataField }) => ({
                header: caption,
                key: dataField,
            }));
        }

        hasChildren(row) {
            return row.items && row.items.length > 0;
        }

        autoFitColumnsWidth() {
            this.worksheet.columns.forEach((column) => {
                let maxLength = MIN_COLUMN_WIDTH;
                if (column.number === 1) {
                    // first column
                    column.eachCell((cell) => {
                        const indent = cell.alignment
                            ? cell.alignment.indent * (PIXELS_PER_INDENT / PIXELS_PER_EXCEL_WIDTH_UNIT)
                            : 0;
                        const valueLength = cell.value.toString().length;

                        if (indent + valueLength > maxLength) maxLength = indent + valueLength;
                    });
                } else {
                    column.values.forEach((v) => {
                        // date column
                        if (
                            this.dateColumns.some((dateColumn) => dateColumn.dataField === column.key)
                            && typeof v !== 'string'
                            && v.toLocaleDateString().length > maxLength
                        ) {
                            maxLength = v.toLocaleDateString().length;
                        }

                        // other columns
                        if (
                            !this.dateColumns.some((dateColumn) => dateColumn.dataField === column.key)
                            && v.toString().length > maxLength
                        ) {
                            maxLength = v.toString().length;
                        }
                    });
                }
                column.width = maxLength + CELL_PADDING;
            });
        }

        export() {
            this.component.beginCustomLoading('Exporting to Excel...');

            return this.getData().then((rows) => {
                this.generateColumns();
                this.exportRows(rows);
                this.autoFitColumnsWidth();
                this.component.endCustomLoading();
            });
        }
    }
    function exportTreeList({ component, worksheet }) {
        const helpers = new TreeListHelpers(component, worksheet);
        return helpers.export();
    }

    function interDim(e) {
        return e.fromComponent._$element[0].id != e.toComponent._$element[0].id
    }

    async function updateNode(e) {
        // Aggiorna pid, order
        if (e.toIndex == e.fromIndex) return
        const visibleRows = e.component.getVisibleRows();
        const reorderedData = visibleRows.map(row => row.data);
        const draggedData = castArray(e.itemData)
        var parentId_update
        if (e.dropInsideItem) {
            parentId_update = visibleRows[e.toIndex].key;
        } else {
            const toIndex = e.fromIndex < e.toIndex ? e.toIndex + 1 : e.toIndex;
            let targetData = toIndex >= 0 ? visibleRows[toIndex].node.data : null;
            // let targetData = visibleRows[toIndex].data;

            // if (targetData && e.component.isRowExpanded(targetData.id)) {
            //     sourceData.pid = targetData.id;
            // } else {
            //     sourceData.pid = targetData ? targetData.pid : e.component.option('rootValue');
            // }
            parentId_update = targetData ? targetData.pid || null : e.component.option('rootValue')

        }
        // var update_node = treeList.getNodeByKey(e.itemData.id);
        draggedData.forEach(item => {
            item.pid = parentId_update;
        })
        e.itemData.data.pid = parentId_update
        await saveUpdatedHierarchy(draggedData);

        const allNodes = treeList.getVisibleRows();
        const node = allNodes.splice(e.fromIndex, 1)
        allNodes.splice(e.toIndex, 0, node[0])
        const siblings = allNodes
            .filter(node => node.data.pid === parentId_update)
            .map(node => node.data);
        const updatedSiblings = siblings.map((item, index) => {
            item.ordine = index + 1; // Assign new incremental order
            return item;
        });
        await updateOrderInDatabase(siblings)

        e.component.getDataSource().reload();
        e.component.refresh();
    }

    // Funzione ricorsiva per aggiornare i valori del nodo e dei suoi figli
    function updateNodeText(node, message) {
        node.text += message; // Modifica il campo 'text' aggiungendo la stringa
        if (node.items && node.items.length > 0) {
            node.items.forEach(childNode => updateNodeText(childNode, message)); // Modifica i figli
        }
    }
    function simulateSearchAndExpand(treeList2Instance, codes, nodeId) {
        const allRows = treeList2Instance.getVisibleRows();
        // const allData = treeList2Instance.getDataSource().items()
        // Evidenziazione dei nodi corrispondenti
        allRows.forEach(row => {
            const rowElement = treeList2Instance.getRowElement(row.rowIndex);
            if (codes.includes(row.data.codice)) {
                $(rowElement).css("background-color", "#ffff99"); // Evidenzia il nodo
                // Espansione dei parent
                const parentIds = getParentIds(row.data.id, allRows);
                parentIds.forEach(pid => {
                    treeList2Instance.expandRow(pid);
                });
            } else {
                $(rowElement).css("background-color", ""); // Rimuovi l'evidenziazione
            }
        });

    }
    function getParentIds(nodeId, data) {
        const parents = [];
        let currentId = nodeId;

        while (currentId) {
            const parent = data.find(item => item.data.id === currentId);
            if (parent && parent.data.pid != null) {
                parents.push(parent.data.pid);
                currentId = parent.data.pid;
            } else {
                break;
            }
        }
        return parents;
    }

    function simulateSearch(treeList2Instance, codes) {
        const allRows = treeList2Instance.getVisibleRows();
        allRows.forEach(row => {
            const rowElement = treeList2Instance.getRowElement(row.rowIndex);
            if (codes.includes(row.data.codice)) {
                $(rowElement).css("background-color", "#ffff99"); // Evidenzia il nodo
            } else {
                $(rowElement).css("background-color", ""); // Rimuovi l'evidenziazione
            }
        });
    }
    async function saveUpdatedHierarchy(rows) {
        rows.forEach(async updatedRow => {
            if (updatedRow.id != updatedRow.pid) {
                const { error } = await supabaseClient
                    .from(projectName)
                    .update({ pid: updatedRow.pid })
                    .eq("id", updatedRow.id);
                if (error) {
                    console.error("Error saving data:", error);
                }
            }
        })
    }
    async function updateOrderInDatabase(siblings) {
        const updates = siblings.map(sibling =>
            supabaseClient
                .from(projectName)
                .update({ ordine: sibling.ordine, skip_audit: true })
                .eq("id", sibling.id)
        );

        // Run all updates in parallel
        const results = await Promise.all(updates);
        const errors = results.filter(result => result.error);
        if (errors.length > 0) {
            return { error: errors };
        }
        return { error: null };
    }
    async function deleteRows(keys) {
        const updates = keys.map(key =>
            supabaseClient
                .from(projectName)
                .update({ deleted: true })
                .eq("id", key)
        );

        // Run all updates in parallel
        const results = await Promise.all(updates);
        const errors = results.filter(result => result.error);
        if (errors.length > 0) {
            return { error: errors };
        }
        return { error: null };
    }
    async function deleteLink(key, field) {
        const { error } = await
            supabaseClient
                .from(projectName + "_link")
                .update({ deleted: true })
                .eq(field, key)  //field = source_id || target_id
        if (error) {
            console.error("Error saving data:", error);
        }
    }
    function collectDescendantCodes(selectedNode, data) {
        const nodeId = selectedNode.id
        const descendants = [];
        // Include il codice del nodo selezionato
        if (selectedNode.codice != null && selectedNode.codice != "") descendants.push(selectedNode.codice);
        if (selectedNode.coorigine != null && selectedNode.coorigine != "") descendants.push(selectedNode.coorigine)
        //Inserisce i discendenti
        function recurse(pid) {
            data.forEach(item => {
                if (item.pid === pid) {
                    if (item.codice != null && item.codice != "") descendants.push(item.codice);
                    if (item.coorigine != null && item.coorigine != "") descendants.push(item.coorigine)
                    recurse(item.id);
                }
            });
        }
        recurse(nodeId);
        return descendants;
    }
    function collectDescendantIDs(selectedNode, data) {
        const nodeId = selectedNode.id
        const descendants = [];
        // Include il codice del nodo selezionato
        if (selectedNode.id != null && selectedNode.id != "") descendants.push(selectedNode.id);
        //Inserisce i discendenti
        function recurse(pid) {
            data.forEach(item => {
                if (item.pid === pid) {
                    if (item.id != null && item.id != "") descendants.push(item.id);
                    recurse(item.id);
                }
            });
        }
        recurse(nodeId);
        result = getLinkedIds(descendants, link)
        return result;
    }

    function getLinkedIds(ids, links) {
        const result = new Set();

        for (const link of links) {
            if (ids.includes(link.source_id) || ids.includes(link.target_id)) {
                result.add(link.source_id);
                result.add(link.target_id);
            }
        }

        return [...result];
    }

    function handleDragEnd(e) {
        const sourceTree = e.fromComponent;  // da dove parte il dragging
        const targetTree = e.toComponent;
        // se non c’è target → annulla
        if (!targetTree) return;


        const node = sourceTree.getNodeByKey(e.itemData.key);
        const rowData = node.data;

        // trigger refresh della riga
        sourceTree.cellValue(node.key, "dummy", rowData.dummy);






        // const target_id = e.toComponent.getVisibleRows()[e.toIndex].data.id - 1
        // const rowElement = targetTree.getRowElement(target_id)[0]; // restituisce jQuery element

        // rowElement.classList.add("node-bold");
        // rowElement.classList.add("node-target");

        // // repaint delle due treelist
        // repaintTree(sourceTree);
        // repaintTree(targetTree);
    }

    function repaintTree(trv) {
        trv.updateDimensions();
        trv.repaint();
    }

    function formatLinkElement(e) {
        const id = e.data.id;
        const el = e.cellElement[0];

        // scegliamo la classe da applicare
        const isSource = sources.has(id);
        const isTarget = targets.has(id);
        if (!isSource && !isTarget) return;

        if (!el || !el.classList) return;

        el.classList.add("node-bold");

        if (isSource && isTarget) {
            el.classList.add("node-both");
        } else if (isSource) {
            el.classList.add("node-source");
        } else if (isTarget) {
            el.classList.add("node-target");
        }

    }
    async function refreshMe() {
        data = await fetchData()
        treeList.load = getMyData();
        treeList.repaint()
        treeList.refresh()

    }

    DevExpress.ui.dxTreeList.prototype.reloadTree = async function (trl) {
        const data = await trl.fetchData();
        trl.option("dataSource", data);
        trl.refresh();
    };


}


