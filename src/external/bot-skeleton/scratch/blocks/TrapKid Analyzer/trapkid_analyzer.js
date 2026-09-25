import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

const colours = () => ({
    colour: window.Blockly.Colours.Base.colour,
    colourSecondary: window.Blockly.Colours.Base.colourSecondary,
    colourTertiary: window.Blockly.Colours.Base.colourTertiary,
});

window.Blockly.Blocks.trapkid_analyzer_match_purchase = {
    init() {
        this.jsonInit({
            message0: localize('TrapKid Analyzer Match Purchase'),
            previousStatement: 'Purchase',
            nextStatement: null,
            ...colours(),
            tooltip: localize('Wait for a locked TrapKid Analyzer signal, use its hot digit as the DIGITMATCH prediction, then purchase.'),
            category: window.Blockly.Categories.Tick_Analysis,
        });
    },
    meta() {
        return {
            display_name: localize('TrapKid Analyzer Match Purchase'),
            description: localize('Synchronizes each purchase with the TrapKid Analyzer locked digit.'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
    restricted_parents: ['before_purchase'],
};

window.Blockly.Blocks.trapkid_analyzer_wait_signal = {
    init() {
        this.jsonInit({
            message0: localize('TrapKid Analyzer: Wait for locked signal'),
            previousStatement: null,
            nextStatement: null,
            ...colours(),
            tooltip: localize('Pause the bot until the Analyzer has a valid non-expired locked signal.'),
            category: window.Blockly.Categories.Tick_Analysis,
        });
    },
    meta() {
        return {
            display_name: localize('Wait for Analyzer signal'),
            description: localize('Waits for a valid locked Analyzer signal.'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.Blocks.trapkid_analyzer_hot_digit = {
    init() {
        this.jsonInit({
            message0: localize('TrapKid Analyzer Hot Digit'),
            output: 'Number',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            ...colours(),
            tooltip: localize('Returns the currently locked Analyzer hot digit.'),
            category: window.Blockly.Categories.Tick_Analysis,
        });
    },
    meta() {
        return {
            display_name: localize('Analyzer hot digit'),
            description: localize('Returns the locked hot digit from the TrapKid Analyzer.'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.Blocks.trapkid_analyzer_current_digit = {
    init() {
        this.jsonInit({
            message0: localize('TrapKid Analyzer Current Digit'),
            output: 'Number',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            ...colours(),
            tooltip: localize('Returns the latest digit reported by the TrapKid Analyzer.'),
            category: window.Blockly.Categories.Tick_Analysis,
        });
    },
    meta() {
        return {
            display_name: localize('Analyzer current digit'),
            description: localize('Returns the latest Analyzer digit.'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.Blocks.trapkid_analyzer_connected = {
    init() {
        this.jsonInit({
            message0: localize('TrapKid Analyzer Connected'),
            output: 'Boolean',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            ...colours(),
            tooltip: localize('True when the TrapKid Analyzer status endpoint is reachable.'),
            category: window.Blockly.Categories.Tick_Analysis,
        });
    },
    meta() {
        return {
            display_name: localize('Analyzer connected'),
            description: localize('Checks whether the Analyzer is reachable.'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.Blocks.trapkid_analyzer_wait_exit = {
    init() {
        this.jsonInit({
            message0: localize('TrapKid Analyzer: Wait for exit then sell'),
            previousStatement: null,
            nextStatement: null,
            ...colours(),
            tooltip: localize('Waits for the Analyzer hot-digit exit event, then requests a market sell. Use only with a contract that supports early selling.'),
            category: window.Blockly.Categories.During_Purchase,
        });
    },
    meta() {
        return {
            display_name: localize('Wait for Analyzer exit then sell'),
            description: localize('Waits for the Analyzer exit event and requests a market sell when supported.'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
    restricted_parents: ['during_purchase'],
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.trapkid_analyzer_match_purchase = () =>
    'TrapKidAnalyzer.purchaseMatch();\\n';
window.Blockly.JavaScript.javascriptGenerator.forBlock.trapkid_analyzer_wait_signal = () =>
    'TrapKidAnalyzer.waitForSignal();\\n';
window.Blockly.JavaScript.javascriptGenerator.forBlock.trapkid_analyzer_hot_digit = () => [
    'TrapKidAnalyzer.getHotDigit()',
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];
window.Blockly.JavaScript.javascriptGenerator.forBlock.trapkid_analyzer_current_digit = () => [
    'TrapKidAnalyzer.getCurrentDigit()',
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];
window.Blockly.JavaScript.javascriptGenerator.forBlock.trapkid_analyzer_connected = () => [
    'TrapKidAnalyzer.isConnected()',
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];
window.Blockly.JavaScript.javascriptGenerator.forBlock.trapkid_analyzer_wait_exit = () =>
    'TrapKidAnalyzer.waitForExitAndSell();\\n';
