function traverse(schema, cb) {
    function innerTraverse(schemaNode, path, noCallback) {
        if (!noCallback) {
            cb(path, schemaNode);
        }

        if (schemaNode.items) {
            if (schemaNode.items.anyOf) {
                schemaNode.items.anyOf.forEach(itemSchema => {
                    let typeValue = itemSchema.properties
                        && itemSchema.properties.type
                        && itemSchema.properties.type.default;
                    if (typeValue) {
                        innerTraverse(
                            itemSchema,
                            path ? (path + '-' + typeValue.replace(/'/g, '')) : typeValue,
                            false
                        );
                    }
                });
            }
            else {
                innerTraverse(schemaNode.items, path, true);
            }
        }
        else if (schemaNode.properties) {
            for (let propName in schemaNode.properties) {
                innerTraverse(
                    schemaNode.properties[propName],
                    path ? (path + '.' + propName) : propName,
                    false
                );
            }
        }

        // Or it's a leaf node.
    }

    innerTraverse(schema.option, 'option', false);
}


function convertToTree(rootSchema, rootNode) {

    function createNodeBase(schema) {
        let schemaType = schema.type;
        // Simplify type
        if (schemaType instanceof Array && schemaType.length === 1) {
            schemaType = schemaType[0];
        }
        let nodeBase = {};

        // Get type from default if possible. Reduce size.
        if (schema.default == null || typeof schema.default !== schemaType) {
            nodeBase.type = schemaType;
        }

        if (schema.default != null) {
            nodeBase.default = schema.default;
        }
        else if (schema.items) {    // Array also may has properties.
            nodeBase.isArray = true;
        }
        else if (schema.properties && Object.keys(schema.properties).length) {
            nodeBase.isObject = true;
        }
        return nodeBase;
    }

    function createArrayItemNode(schema, parentNode) {
        let childNode = createNodeBase(schema, parentNode);
        if (schema.properties && schema.properties.type && schema.properties.type.default) {
            childNode.arrayItemType = schema.properties.type.default;
        }
        else {
            throw new Error('Some thing wrong happens', schema);
        }
        return childNode;
    }
    function createPropertyNode(propName, schema, parentNode) {
        let childNode = createNodeBase(schema, parentNode);
        childNode.prop = propName;
        return childNode;
    }
    function processObjectType(currentSchema, currentNode) {
        if (!currentSchema.properties) {
            return;
        }
        let children = [];
        for (let propName in currentSchema.properties) {
            let childSchema = currentSchema.properties[propName];
            let childNode = createPropertyNode(propName, childSchema, currentNode);
            processRecursively(childSchema, childNode);
            children.push(childNode);
        }
        if (children.length) {
            currentNode.children = children;
        }
    }

    function processArrayType(currentSchema, currentNode) {
        if (!currentSchema.items) {
            return;
        }
        // Each item of array may have different type of object.
        // Like series, visualMap, legend
        if (currentSchema.items.anyOf) {
            let children = [];
            currentSchema.items.anyOf.forEach(itemSchema => {
                let childNode = createArrayItemNode(itemSchema, currentNode);
                processRecursively(itemSchema, childNode);
                children.push(childNode);
            });
            currentNode.children = children;
        }
        // Each item of array only have one type of object.
        // Like data and most of the compoents.
        else {
            processObjectType(
                currentSchema.items, currentNode
            );
        }
    }

    function processRecursively(currentSchema, currentNode) {
        // Array also may has properties.
        if (currentSchema.items) {
            processArrayType(currentSchema, currentNode);
        }
        else if (currentSchema.properties) {
            processObjectType(currentSchema, currentNode);
        }
        return currentNode;
    }

    return processRecursively(
        rootSchema, rootNode, 0
    );
};

// Partion the descriptions by the first part of path. For example
// { "title.label", "series-line.data", "series-bar.data" }
// Will be
// {
//   "title": { "label" },
//   "series-line": {"data"},
//   "series-bar": {"data"}
// }
module.exports = function (schema) {
    let descriptionsMap = {};
    traverse(schema, (schemaPath, schemaNode) => {
        if (schemaNode.description) {
            // Extract component level path
            let parts = schemaPath.split('.');
            let divider = parts.length > 2 ? 2 : 1;
            let partionKey = parts.slice(0, divider).join('.');
            let subKey = parts.slice(divider).join('.');

            descriptionsMap[partionKey] = descriptionsMap[partionKey] || {};
            descriptionsMap[partionKey][subKey] = schemaNode.description;
        }
    });

    return {
        outline: convertToTree(schema.option, {}),
        descriptions: descriptionsMap
    };
};