package app.wingtipmaps.gateway.service;

import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionOperations;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * A read-only transaction a service opens around its reads alone, where it
 * asks the planner after them: an annotated method would hold its Hikari
 * connection (a pool of ten) for every planner call inside it, each up to
 * 20 s with one retry.
 */
final class ReadOnly {

    private ReadOnly() {}

    static TransactionOperations transactions(PlatformTransactionManager manager) {
        TransactionTemplate read = new TransactionTemplate(manager);
        read.setReadOnly(true);
        return read;
    }
}
