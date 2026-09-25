import { observer as globalObserver } from '../../../utils/observer';
import { createDetails } from '../utils/helpers';

const getBotInterface = tradeEngine => {
    const getDetail = i => createDetails(tradeEngine.data.contract)[i];

    return {
        init: (...args) => tradeEngine.init(...args),
        start: (...args) => tradeEngine.start(...args),
        stop: (...args) => tradeEngine.stop(...args),
        purchase: contract_type => tradeEngine.purchase(contract_type),
        purchaseWithPrediction: async (contract_type, prediction) => {
            const numericPrediction = Number(prediction);
            if (!Number.isInteger(numericPrediction) || numericPrediction < 0 || numericPrediction > 9) {
                throw new Error('TrapKid Analyzer returned an invalid digit prediction.');
            }

            if (!tradeEngine.tradeOptions) {
                throw new Error('Trade options are not initialized.');
            }

            // The custom TrapKid purchase block uses stake-based contracts by default.
            // Updating tradeOptions immediately before purchase makes the Analyzer's
            // locked digit the prediction for this individual contract.
            tradeEngine.tradeOptions = {
                ...tradeEngine.tradeOptions,
                prediction: numericPrediction,
            };

            return tradeEngine.purchase(contract_type);
        },
        getAskPrice: contract_type => Number(getProposal(contract_type, tradeEngine).ask_price),
        getPayout: contract_type => Number(getProposal(contract_type, tradeEngine).payout),
        getPurchaseReference: () => tradeEngine.getPurchaseReference(),
        isSellAvailable: () => tradeEngine.isSellAtMarketAvailable(),
        sellAtMarket: () => tradeEngine.sellAtMarket(),
        getSellPrice: () => getSellPrice(tradeEngine),
        isResult: result => getDetail(10) === result,
        isTradeAgain: result => globalObserver.emit('bot.trade_again', result),
        readDetails: i => getDetail(i - 1),
    };
};

const getProposal = (contract_type, tradeEngine) => {
    return tradeEngine.data.proposals.find(
        proposal =>
            proposal.contract_type === contract_type &&
            proposal.purchase_reference === tradeEngine.getPurchaseReference()
    );
};

const getSellPrice = tradeEngine => {
    return tradeEngine.getSellPrice();
};

export default getBotInterface;
