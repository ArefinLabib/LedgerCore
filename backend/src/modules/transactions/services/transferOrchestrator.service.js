import { refreshAccountListsCache } from '../../../cache/accountCache.js';
import { transferService as pessimisticService } from './transfer.service.js';
import { transferServiceOptimistic } from './transfer_optimistic.service.js';
import { transferServiceSerializable } from './transfer_serializable.services.js';

const STRATEGIES = {
    pessimistic: (fromId, toId, amount) => pessimisticService.executeTransfer(fromId, toId, amount),
    optimistic: (fromId, toId, amount) => transferServiceOptimistic.executeTransferWithRetry(fromId, toId, amount),
    serializable: (fromId, toId, amount) => transferServiceSerializable.executeTransfer(fromId, toId, amount)
};

export const transferOrchestratorService = {
    async executeTransfer(strategyKey, fromAccountId, toAccountId, amount, userIds) {
        const execute = STRATEGIES[strategyKey] || STRATEGIES.serializable;
        const result = await execute(fromAccountId, toAccountId, amount);

        await refreshAccountListsCache(userIds);
        return result;
    }
};