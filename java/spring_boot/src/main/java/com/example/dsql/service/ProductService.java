package com.example.dsql.service;

import com.example.dsql.model.Product;
import com.example.dsql.repository.ProductRepository;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.retry.annotation.Backoff;
import org.springframework.retry.annotation.Retryable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@Transactional
public class ProductService {

    private final ProductRepository productRepository;

    public ProductService(ProductRepository productRepository) {
        this.productRepository = productRepository;
    }

    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.NOT_SUPPORTED)
    public void initializeSchema() {
        productRepository.initSchema();
    }

    public Product createProduct(Product product) {
        return productRepository.save(product);
    }

    public Product getProduct(UUID id) {
        return productRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Product not found: " + id));
    }

    public List<Product> getAllProducts() {
        return productRepository.findAll();
    }

    public Product updateProduct(UUID id, Product product) {
        Product existing = getProduct(id);
        existing.setName(product.getName());
        existing.setDescription(product.getDescription());
        existing.setPrice(product.getPrice());
        existing.setStock(product.getStock());
        return productRepository.update(existing);
    }

    public void deleteProduct(UUID id) {
        productRepository.deleteById(id);
    }

    @Retryable(
        retryFor = OptimisticLockingFailureException.class,
        maxAttempts = 4,
        backoff = @Backoff(delay = 100, multiplier = 2, random = true)
    )
    public void updateStock(UUID productId, int quantity) {
        Product product = getProduct(productId);
        int newStock = product.getStock() + quantity;
        if (newStock < 0) {
            throw new RuntimeException("Insufficient stock");
        }
        productRepository.updateStock(productId, quantity);
    }
}
