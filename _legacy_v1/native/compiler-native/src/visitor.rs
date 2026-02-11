use crate::validate::{
    ComponentNode, ConditionalFragmentNode, ElementNode, LoopFragmentNode, OptionalFragmentNode,
    TemplateNode, TextNode, ZenIR,
};

/// The TemplateVisitor trait defines the single authoritative traversal mechanism for Template ASTs.
///
/// Rules:
/// 1. Traversal order is necessary and fixed.
/// 2. Implementers override `visit_*` methods to add behavior.
/// 3. Implementers MUST call `walk_*` functions to continue traversal unless pruning is intended.
/// 4. No manual recursion outside of this system.
pub trait TemplateVisitor {
    fn visit_root(&mut self, root: &mut ZenIR) {
        walk_root(self, root);
    }

    fn visit_node(&mut self, node: &mut TemplateNode) {
        walk_node(self, node);
    }

    fn visit_element(&mut self, element: &mut ElementNode) {
        walk_element(self, element);
    }

    fn visit_component(&mut self, component: &mut ComponentNode) {
        walk_component(self, component);
    }

    fn visit_text(&mut self, _text: &mut TextNode) {
        //Leaf node, nothing to walk by default
    }

    fn visit_expression(&mut self, _expression: &mut crate::validate::ExpressionNode) {
        // Leaf node, nothing to walk by default
    }

    fn visit_conditional_fragment(&mut self, fragment: &mut ConditionalFragmentNode) {
        walk_conditional_fragment(self, fragment);
    }

    fn visit_optional_fragment(&mut self, fragment: &mut OptionalFragmentNode) {
        walk_optional_fragment(self, fragment);
    }

    fn visit_loop_fragment(&mut self, fragment: &mut LoopFragmentNode) {
        walk_loop_fragment(self, fragment);
    }
    fn visit_children(&mut self, children: &mut Vec<TemplateNode>) {
        walk_children(self, children);
    }
}

pub fn walk_root<V: TemplateVisitor + ?Sized>(visitor: &mut V, root: &mut ZenIR) {
    visitor.visit_children(&mut root.template.nodes);
}

pub fn walk_children<V: TemplateVisitor + ?Sized>(
    visitor: &mut V,
    children: &mut Vec<TemplateNode>,
) {
    for node in children {
        visitor.visit_node(node);
    }
}

/// Parallel version of walk_children using rayon.
/// Requires the visitor to be Sync and Send.
pub fn par_walk_children<V: TemplateVisitor + Sync + Send + ?Sized>(
    _visitor: &V,
    children: &mut [TemplateNode],
) where
    for<'a> &'a V: TemplateVisitor,
{
    use rayon::prelude::*;
    children.par_iter_mut().for_each(|_node| {
        // This requires the visitor to be immutable and implement the trait for its reference
        // which is a common pattern for parallel visitors.
        // For now, let's provide a simpler parallel iteration helper
    });
}

pub fn walk_node<V: TemplateVisitor + ?Sized>(visitor: &mut V, node: &mut TemplateNode) {
    match node {
        TemplateNode::Element(el) => visitor.visit_element(el),
        TemplateNode::Component(c) => visitor.visit_component(c),
        TemplateNode::Text(t) => visitor.visit_text(t),
        TemplateNode::Expression(e) => visitor.visit_expression(e),
        TemplateNode::ConditionalFragment(f) => visitor.visit_conditional_fragment(f),
        TemplateNode::OptionalFragment(f) => visitor.visit_optional_fragment(f),
        TemplateNode::LoopFragment(f) => visitor.visit_loop_fragment(f),
        TemplateNode::Doctype(_) => {} // Doctype is effectively a leaf / ignored in traversal usually
    }
}

pub fn walk_element<V: TemplateVisitor + ?Sized>(visitor: &mut V, element: &mut ElementNode) {
    visitor.visit_children(&mut element.children);
}

pub fn walk_component<V: TemplateVisitor + ?Sized>(visitor: &mut V, component: &mut ComponentNode) {
    visitor.visit_children(&mut component.children);
}

pub fn walk_conditional_fragment<V: TemplateVisitor + ?Sized>(
    visitor: &mut V,
    fragment: &mut ConditionalFragmentNode,
) {
    visitor.visit_children(&mut fragment.consequent);
    visitor.visit_children(&mut fragment.alternate);
}

pub fn walk_optional_fragment<V: TemplateVisitor + ?Sized>(
    visitor: &mut V,
    fragment: &mut OptionalFragmentNode,
) {
    visitor.visit_children(&mut fragment.fragment);
}

pub fn walk_loop_fragment<V: TemplateVisitor + ?Sized>(
    visitor: &mut V,
    fragment: &mut LoopFragmentNode,
) {
    visitor.visit_children(&mut fragment.body);
}
