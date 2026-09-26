// @ts-nocheck — vendored bot code with known upstream type gaps; see AGENTS.md
import { action, computed, makeObservable, observable, reaction } from 'mobx';
import { formatDate, isEnded } from '@/components/shared';
import { LogTypes } from '@/external/bot-skeleton';
import { ProposalOpenContract } from '@deriv/api-types';
import { TPortfolioPosition, TStores } from '@deriv/stores/types';
import { observer as globalObserver } from '@/external/bot-skeleton/utils/observer';
import { TContractInfo } from '../components/summary/summary-card.types';
import { transaction_elements } from '../constants/transactions';
import { getStoredItemsByKey, getStoredItemsByUser, setStoredItemsByKey } from '../utils/session-storage';
import RootStore from './root-store';

type TTransaction = {
    type: string;
    data?: string | TContractInfo;
};

type TElement = {
    [key: string]: TTransaction[];
};

export default class TransactionsStore {
    root_store: RootStore;
    core: TStores;
    disposeReactionsFn: () => void;

    constructor(root_store: RootStore, core: TStores) {
        this.root_store = root_store;
        this.core = core;
        this.is_transaction_details_modal_open = false;

        makeObservable(this, {
            elements: observable,
            active_transaction_id: observable,
            recovered_completed_transactions: observable,
            recovered_transactions: observable,
            is_called_proposal_open_contract: observable,
            is_transaction_details_modal_open: observable,
            transactions: computed,
            onBotContractEvent: action.bound,
            onDerivTransactionEvent: action.bound,
            onDerivBuyEvent: action.bound,
            onDerivSellEvent: action.bound,
            pushTransaction: action.bound,
            clear: action.bound,
            registerReactions: action.bound,
            recoverPendingContracts: action.bound,
            updateResultsCompletedContract: action.bound,
            sortOutPositionsBeforeAction: action.bound,
            recoverPendingContractsById: action.bound,
        });

        globalObserver.register('bot.contract', this.onBotContractEvent);
        globalObserver.register('deriv.transaction', this.onDerivTransactionEvent);
        globalObserver.register('deriv.contract.buy', this.onDerivBuyEvent);
        globalObserver.register('deriv.contract.sell', this.onDerivSellEvent);
        this.disposeReactionsFn = this.registerReactions();
    }
    TRANSACTION_CACHE = 'transaction_cache';

    elements: TElement = getStoredItemsByUser(this.TRANSACTION_CACHE, this.core?.client?.loginid, []);
    active_transaction_id: null | number = null;
    recovered_completed_transactions: number[] = [];
    recovered_transactions: number[] = [];
    is_called_proposal_open_contract = false;
    is_transaction_details_modal_open = false;

    // Raw Deriv transaction notifications are kept separately until the matching
    // proposal_open_contract message arrives. This prevents a race between the
    // transaction stream and the contract stream from losing sell transaction IDs
    // or balance_after.
    deriv_ledger: Record<string, any> = {};

    get transactions(): TTransaction[] {
        if (this.core?.client?.loginid) return this.elements[this.core?.client?.loginid] ?? [];
        return [];
    }

    get statistics() {
        let total_runs = 0;
        // Filter out only contract transactions and remove dividers
        const trxs = this.transactions.filter(
            trx => trx.type === transaction_elements.CONTRACT && typeof trx.data === 'object'
        );
        const statistics = trxs.reduce(
            (stats, { data }) => {
                const contract = data as TContractInfo;
                const profit = Number(contract.profit) || 0;
                const is_completed = contract.is_completed || false;
                const buy_price = Number(contract.buy_price) || 0;
                const payout = Number(contract.payout) || Number(contract.bid_price) || 0;
                const bid_price = Number(contract.bid_price) || 0;

                if (is_completed) {
                    if (profit > 0) {
                        stats.won_contracts += 1;
                        stats.total_payout += payout ?? bid_price ?? 0;
                    } else {
                        stats.lost_contracts += 1;
                    }
                    stats.total_profit += profit;
                    stats.total_stake += buy_price;
                    total_runs += 1;
                }
                return stats;
            },
            {
                lost_contracts: 0,
                number_of_runs: 0,
                total_profit: 0,
                total_payout: 0,
                total_stake: 0,
                won_contracts: 0,
            }
        );
        statistics.number_of_runs = total_runs;
        return statistics;
    }

    toggleTransactionDetailsModal = (is_open: boolean) => {
        this.is_transaction_details_modal_open = is_open;
    };

    onDerivBuyEvent(buy: any) {
        if (!buy?.contract_id) return;
        this.onDerivTransactionEvent({
            ...buy,
            action: 'buy',
            transaction_id: buy.transaction_id,
            buy_price: buy.buy_price,
            payout: buy.payout,
            balance_after: buy.balance_after,
        });
    }

    onDerivSellEvent(sell: any) {
        if (!sell?.contract_id) return;
        this.onDerivTransactionEvent({
            ...sell,
            action: 'sell',
            transaction_id: sell.transaction_id,
            sell_price: sell.sold_for,
            bid_price: sell.sold_for,
            payout: sell.sold_for,
            balance_after: sell.balance_after,
        });
    }

    onDerivTransactionEvent(transaction: any) {
        if (!transaction?.contract_id) return;

        const contractId = String(transaction.contract_id);
        const previous = this.deriv_ledger[contractId] || {};
        const action = String(transaction.action || '').toLowerCase();

        const next = {
            ...previous,
            contract_id: transaction.contract_id,
            currency: transaction.currency ?? previous.currency,
            balance_after:
                transaction.balance_after !== undefined
                    ? Number(transaction.balance_after)
                    : previous.balance_after,
        };

        if (action === 'buy') {
            next.buy_transaction_id = transaction.transaction_id;
            next.transaction_ids = {
                ...(previous.transaction_ids || {}),
                buy: transaction.transaction_id,
            };
        }

        if (action === 'sell') {
            next.sell_transaction_id = transaction.transaction_id;
            next.sell_price =
                transaction.amount !== undefined ? Math.abs(Number(transaction.amount)) : previous.sell_price;
            next.bid_price = next.sell_price;
            next.payout = next.sell_price;
            next.transaction_ids = {
                ...(previous.transaction_ids || {}),
                sell: transaction.transaction_id,
            };
        }

        this.deriv_ledger[contractId] = next;

        // Deriv's transaction stream is also the authoritative account-balance
        // source for this ledger entry.
        if (next.balance_after !== undefined && Number.isFinite(Number(next.balance_after))) {
            this.core?.client?.setBalance?.(String(next.balance_after));
        }

        const current_account = this.core?.client?.loginid as string;
        const index = this.elements[current_account]?.findIndex(item => {
            if (item.type !== transaction_elements.CONTRACT || typeof item.data === 'string') return false;
            return String(item.data?.contract_id) === contractId;
        });

        if (index !== undefined && index >= 0) {
            const existing = this.elements[current_account][index].data as TContractInfo;
            this.pushTransaction({
                ...existing,
                ...next,
                transaction_ids: {
                    ...(existing.transaction_ids || {}),
                    ...(next.transaction_ids || {}),
                },
            } as TContractInfo);
        }
    }

    onBotContractEvent(data: TContractInfo) {
        if (!data?.contract_id) return;
        const ledger = this.deriv_ledger[String(data.contract_id)] || {};

        const merged: TContractInfo = {
            ...data,
            ...ledger,
            transaction_ids: {
                ...(data.transaction_ids || {}),
                ...(ledger.transaction_ids || {}),
            },
        };

        this.pushTransaction(merged);
    }

    pushTransaction(data: TContractInfo) {
        const is_completed = isEnded(data as ProposalOpenContract);
        const { run_id } = this.root_store.run_panel;
        const current_account = this.core?.client?.loginid as string;

        const contract: TContractInfo = {
            ...data,
            is_completed,
            run_id,
            date_start: formatDate(data.date_start, 'YYYY-M-D HH:mm:ss [GMT]'),
            entry_tick: data.entry_spot,
            entry_tick_time: data.entry_tick_time && formatDate(data.entry_tick_time, 'YYYY-M-D HH:mm:ss [GMT]'),
            exit_tick: (data as any).exit_spot || data.exit_tick,
            exit_tick_time: data.exit_tick_time && formatDate(data.exit_tick_time, 'YYYY-M-D HH:mm:ss [GMT]'),
            profit: is_completed ? data.profit : 0,
            // For early sells the realized amount is sell_price/bid_price. Keep
            // Deriv's original payout when it exists, but never let a zero/empty
            // payout hide the actual realized exit value.
            payout:
                is_completed && Number(data.payout) === 0 && Number(data.sell_price || data.bid_price) > 0
                    ? Number(data.sell_price || data.bid_price)
                    : data.payout,
        };

        if (!this.elements[current_account]) {
            this.elements = {
                ...this.elements,
                [current_account]: [],
            };
        }

        const same_contract_index = this.elements[current_account]?.findIndex(c => {
            if (typeof c.data === 'string') return false;
            return (
                c.type === transaction_elements.CONTRACT &&
                c.data?.transaction_ids &&
                c.data.transaction_ids.buy === data.transaction_ids?.buy
            );
        });

        if (same_contract_index === -1) {
            // Render a divider if the "run_id" for this contract is different.
            if (this.elements[current_account]?.length > 0) {
                const temp_contract = this.elements[current_account]?.[0];
                const is_contract = temp_contract.type === transaction_elements.CONTRACT;
                const is_new_run =
                    is_contract &&
                    typeof temp_contract.data === 'object' &&
                    contract.run_id !== temp_contract?.data?.run_id;

                if (is_new_run) {
                    this.elements[current_account]?.unshift({
                        type: transaction_elements.DIVIDER,
                        data: contract.run_id,
                    });
                }
            }

            this.elements[current_account]?.unshift({
                type: transaction_elements.CONTRACT,
                data: contract,
            });
        } else {
            // If data belongs to existing contract in memory, update it.
            this.elements[current_account]?.splice(same_contract_index, 1, {
                type: transaction_elements.CONTRACT,
                data: contract,
            });
        }

        this.elements = { ...this.elements }; // force update
    }

    clear() {
        if (this.elements && this.elements[this.core?.client?.loginid as string]?.length > 0) {
            this.elements[this.core?.client?.loginid as string] = [];
        }
        this.recovered_completed_transactions = this.recovered_completed_transactions?.slice(0, 0);
        this.recovered_transactions = this.recovered_transactions?.slice(0, 0);
        this.is_transaction_details_modal_open = false;
    }

    registerReactions() {
        const { client } = this.core;

        // Write transactions to session storage on each change in transaction elements.
        const disposeTransactionElementsListener = reaction(
            () => this.elements[client?.loginid as string],
            elements => {
                const stored_transactions = getStoredItemsByKey(this.TRANSACTION_CACHE, {});
                stored_transactions[client.loginid as string] = elements?.slice(0, 5000) ?? [];
                setStoredItemsByKey(this.TRANSACTION_CACHE, stored_transactions);
            }
        );

        // User could've left the page mid-contract. On initial load, try
        // to recover any pending contracts so we can reflect accurate stats
        // and transactions.
        const disposeRecoverContracts = reaction(
            () => this.transactions.length,
            () => this.recoverPendingContracts()
        );

        return () => {
            globalObserver.unregister('bot.contract', this.onBotContractEvent);
            globalObserver.unregister('deriv.transaction', this.onDerivTransactionEvent);
            globalObserver.unregister('deriv.contract.buy', this.onDerivBuyEvent);
            globalObserver.unregister('deriv.contract.sell', this.onDerivSellEvent);
            disposeTransactionElementsListener();
            disposeRecoverContracts();
        };
    }

    recoverPendingContracts(contract = null) {
        this.transactions.forEach(({ data: trx }) => {
            if (
                typeof trx === 'string' ||
                trx?.is_completed ||
                !trx?.contract_id ||
                this.recovered_transactions.includes(trx?.contract_id)
            )
                return;
            this.recoverPendingContractsById(trx.contract_id, contract);
        });
    }

    updateResultsCompletedContract(contract: ProposalOpenContract) {
        const { journal, summary_card } = this.root_store;
        const { contract_info } = summary_card;
        const { currency, profit } = contract;

        // Always apply the latest Deriv proposal_open_contract snapshot.
        // The previous contract_id !== summary.contract_id guard dropped the final
        // sold snapshot when the summary had already received the same contract.
        this.onBotContractEvent(contract);

        if (contract.contract_id && !this.recovered_transactions.includes(contract.contract_id)) {
            this.recovered_transactions.push(contract.contract_id);
        }
        if (
            contract.contract_id &&
            !this.recovered_completed_transactions.includes(contract.contract_id) &&
            isEnded(contract)
        ) {
            this.recovered_completed_transactions.push(contract.contract_id);

            journal.onLogSuccess({
                log_type: profit && profit > 0 ? LogTypes.PROFIT : LogTypes.LOST,
                extra: { currency, profit },
            });
        }
    }

    sortOutPositionsBeforeAction(positions: TPortfolioPosition[], element_id?: number) {
        positions?.forEach(position => {
            if (!element_id || (element_id && position.id === element_id)) {
                const contract_details = position.contract_info;
                this.updateResultsCompletedContract(contract_details);
            }
        });
    }

    async recoverPendingContractsById(contract_id: number, contract: ProposalOpenContract | null = null) {
        // TODO: need to fix as the portfolio is not available now
        // const positions = this.core.portfolio.positions;
        const positions: unknown[] = [];

        if (contract) {
            this.is_called_proposal_open_contract = true;
            if (contract.contract_id === contract_id) {
                this.updateResultsCompletedContract(contract);
            }
        }

        if (!this.is_called_proposal_open_contract) {
            if (this.core?.client?.loginid) {
                const current_account = this.core?.client?.loginid;
                if (!this.elements[current_account]?.length) {
                    this.sortOutPositionsBeforeAction(positions);
                }

                const elements = this.elements[current_account];
                const [element = null] = elements;
                if (typeof element?.data === 'object' && !element?.data?.profit) {
                    const element_id = element.data.contract_id;
                    this.sortOutPositionsBeforeAction(positions, element_id);
                }
            }
        }
    }
}
